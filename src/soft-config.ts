// https://codingsans.com/blog/node-config-best-practices
import * as jsonComment from 'comment-json'
import * as Convict from 'convict'
import * as d from 'debug'
import fs = require('fs')
import moment = require('moment')
import * as path from 'path'

import { sanitizeFileName } from './commands/base'
import { HardConfig } from './hard-config'

const debug = d('config:soft')
export const loadFileSync = fs.readFileSync as (path: string) => string

interface ConfigObject {
  chapterPattern: string // | ConfigProperty
  metadataPattern: string // | ConfigProperty
  summaryPattern: string
  buildDirectory: string // | ConfigProperty
  projectTitle: string // | ConfigProperty
  projectAuthor: Author // | ConfigProperty
  projectLang: string // | ConfigProperty
  fontName: string // | ConfigProperty
  fontSize: string // | ConfigProperty
  numberingStep: number
  numberingInitial: number
  metadataFields: object
}

export interface Author {
  name: string
  email: string
}

export class SoftConfig {
  public get config(): ConfigObject {
    if (!this._config) {
      //   return this._config as ConfigObject
      // } else {
      const jsonConfig: any = this.configSchema.getProperties() // so we can operate with a plain old JavaScript object and abstract away convict (optional)
      jsonConfig.chapterPattern = sanitizeFileName(jsonConfig.chapterPattern, true)
      jsonConfig.metadataPattern = sanitizeFileName(jsonConfig.metadataPattern, true)
      jsonConfig.summaryPattern = sanitizeFileName(jsonConfig.summaryPattern, true)
      jsonConfig.metadataFields = {
        manual: this._metadataFieldsObj,
        computed: { title: '###', wordCount: 0 },
        extracted: {}
      }

      this._config = jsonConfig
      // return jsonConfig as ConfigObject
    }
    return this._config as ConfigObject
  }

  public get metadataFieldsDefaults(): any {
    return this._metadataFieldsObj
  }

  public get projectRootPath(): string {
    return this.rootPath
  }

  public get buildDirectory(): string {
    return path.join(this.rootPath, this.config.buildDirectory)
  }

  public get globalMetadataContent(): string {
    return `---
title: ${this.config.projectTitle}
author: ${this.config.projectAuthor.name}
lang: ${this.config.projectLang}
fontsize: ${this.config.fontSize}
date: ${moment().format('D MMMM YYYY')}
...

`
  }

  public get emptyFileString(): string {
    if (!this._emptyFileString) {
      try {
        const content = loadFileSync(this.hardConfig.emptyFilePath)
        this._emptyFileString = content
      } catch (err) {
        debug(err)
      }
    }
    return this._emptyFileString
  }

  // public templateReadmeString = `\n# ${this.config.projectTitle}\n\nA novel by ${this.config.projectAuthor.name}.`

  private _config: ConfigObject | undefined
  private readonly _metadataFieldsObj: any

  private readonly configSchemaObject: any = {
    chapterPattern: {
      doc:
        'File naming pattern for chapter files. Use NUM for chapter number and NAME for chapter name.  Optionally use `/` for a folder structure, e.g. `NUM.NAME.md` or `NUM/NAME.chptr`.  Defaults to `NUM NAME.chptr`.',
      format: (val: string) => {
        if (!/^(?=.*NUM)(?=.*NAME).*$/.test(val)) {
          throw new Error('Must have NUM and NAME in pattern')
        }
        const numPos = val.indexOf('NUM')
        const namePos = val.indexOf('NAME')
        if (namePos < numPos) {
          throw new Error('First NUM must be before first NAME in pattern')
        }
      },
      default: 'NUM NAME.chptr'
    },
    metadataPattern: {
      doc:
        'File naming pattern for metadata files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Defaults to `NUM.metadata.json`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) {
          // && !/^$/.test(val)
          throw new Error('Must have NUM in pattern')
        }
        if (/^(?=.*NAME).*$/.test(val)) {
          const numPos = val.indexOf('NUM')
          const namePos = val.indexOf('NAME')
          if (namePos < numPos) {
            throw new Error('First NUM must be before first NAME in pattern')
          }
        }
      },
      default: 'NUM.metadata.json'
    },
    summaryPattern: {
      doc:
        'File naming pattern for summary files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Defaults to `NUM.summary.md`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) {
          // && !/^$/.test(val)
          throw new Error('Must have NUM in pattern')
        }
        if (/^(?=.*NAME).*$/.test(val)) {
          const numPos = val.indexOf('NUM')
          const namePos = val.indexOf('NAME')
          if (namePos < numPos) {
            throw new Error('First NUM must be before first NAME in pattern')
          }
        }
      },
      default: 'NUM.summary.md'
    },
    buildDirectory: {
      doc: 'Directory where to output builds done with Pandoc.  Defaults to `build/`.',
      default: 'build/'
    },
    projectTitle: {
      doc: 'Title for the project.  Will be used as a head title in renderings.',
      default: 'MyNovel'
    },
    projectAuthor: {
      doc: "Author's name and email for the project.",
      name: {
        doc: "Author's name for the project.",
        default: '',
        format: (val: string) => {
          if (val.length === 0) {
            throw new Error('Must have an author name')
          }
        }
      },
      email: {
        doc: "Author's email for the project.",
        default: '---',
        format: 'email'
      }
    },
    projectLang: {
      doc: 'Project language',
      default: 'en'
    },
    fontName: {
      //TODO: use parameter?
      //TODO: make use of it in exports
      doc: 'Font to use for the rendering engines that use it',
      default: ''
    },
    fontSize: {
      //TODO: use parameter?
      //TODO: make use of it in exports
      doc: 'Font size for the rendering engines that use it',
      default: '12pt'
    },
    numberingStep: {
      doc: 'Increment step when numbering files',
      default: 1
    },
    numberingInitial: {
      doc: 'Initial file number',
      default: 1
    }
    // ,
    // metadataFields: {
    //   doc: 'All fields to be added in each Metadata file.  JSON.stringified string.',
    //   format: String,
    //   default: JSON.stringify(JSON.stringify(this.metadataCustomFieldsObject))
    // }
  }
  private readonly configSchema = Convict(this.configSchemaObject)
  private readonly hardConfig: HardConfig
  private readonly rootPath: string

  private _emptyFileString=''

  constructor(dirname: string, readFromFile = true) {
    this.hardConfig = new HardConfig(dirname)
    this.rootPath = path.join(dirname)

    if (readFromFile) {
      try {
        fs.accessSync(this.hardConfig.configFilePath, fs.constants.R_OK)
      } catch (err) {
        throw new Error(`File ${this.hardConfig.configFilePath} either doesn't exist or is not readable by process.\n${err}`)
      }

      let configFileString = ''
      let metadataFieldsString = ''
      try {
        configFileString = loadFileSync(this.hardConfig.configFilePath)
        metadataFieldsString = loadFileSync(this.hardConfig.metadataFieldsFilePath)
      } catch (err) {
        throw new Error(`loading config files error: ${err.toString().infoColor()}`.errorColor())
      }

      try {
        const json5Config = jsonComment.parse(configFileString, undefined, true)
        this.configSchema.load(json5Config)
        this.configSchema.validate({ allowed: 'strict' }) // 'strict' throws error if config does not conform to schema
      } catch (err) {
        throw new Error(`processing config data error: ${err.toString().infoColor()}`.errorColor())
      }

      try {
        this._metadataFieldsObj = jsonComment.parse(metadataFieldsString, undefined, false)
      } catch (err) {
        throw new Error(`processing metadata fields error: ${err.toString().infoColor()}`.errorColor())
      }
    }
  }

  public configDefaultsWithMetaString(overrideObj?: object): string {
    const overrideObj2: any = overrideObj || {}
    const jsonConfig = this.config
    const props = Object.keys(jsonConfig)

    const spaces = 4
    let configDefaultsString = '{\n'

    for (let i = 0; i !== props.length; i++) {
      if (jsonConfig.hasOwnProperty(props[i]) && this.configSchemaObject[props[i]]) {
        configDefaultsString += ' '.repeat(spaces)
        configDefaultsString += '// '
        configDefaultsString += this.configSchemaObject[props[i]].doc
        configDefaultsString += '\n'
        configDefaultsString += ' '.repeat(spaces)
        configDefaultsString += `"`
        configDefaultsString += props[i]
        configDefaultsString += `"`
        configDefaultsString += `: `
        let val = overrideObj2[props[i]] || this.configSchema.default(props[i])
        if (typeof val === 'object') {
          val = JSON.stringify(val)
        } else {
          if (typeof val === 'string' && val.substring(0, 1) === '"') {
            // do nothing
          } else {
            val = `"${val}"`
          }
        }
        configDefaultsString += val
        configDefaultsString += `,\n`
      }
    }
    configDefaultsString = configDefaultsString.replace(/(.*),\n$/, '$1')
    configDefaultsString += '\n}'
    debug(`configDefaultsString = ${configDefaultsString}`)
    return configDefaultsString
  }

  public chapterWildcard(atNumbering: boolean): string {
    return this.wildcardize(this.config.chapterPattern, atNumbering)
  }
  public metadataWildcard(atNumbering: boolean): string {
    return this.wildcardize(this.config.metadataPattern, atNumbering)
  }
  public summaryWildcard(atNumbering: boolean): string {
    return this.wildcardize(this.config.summaryPattern, atNumbering)
  }

  public chapterWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.wildcardWithNumber(this.config.chapterPattern, num, atNumbering)
  }
  public metadataWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.wildcardWithNumber(this.config.metadataPattern, num, atNumbering)
  }
  public summaryWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.wildcardWithNumber(this.config.summaryPattern, num, atNumbering)
  }

  public chapterFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.filenameFromParameters(this.config.chapterPattern, num, name, atNumbering)
  }

  public metadataFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.filenameFromParameters(this.config.metadataPattern, num, name, atNumbering)
  }

  public summaryFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.filenameFromParameters(this.config.summaryPattern, num, name, atNumbering)
  }

  public chapterRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.chapterPattern, atNumber)
  }

  public metadataRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.metadataPattern, atNumber)
  }

  public summaryRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.summaryPattern, atNumber)
  }

  public numbersPattern(atNumber: boolean): string {
    return atNumber ? '@(\\d+)' : '(\\d+)'
  }

  public isAtNumbering(filename: string): boolean {
    const re = new RegExp(this.numbersPattern(true))
    return re.exec(filename) !== null
  }

  public wildcardize(pattern: string, atNumbering: boolean): string {
    return pattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering)).replace(/NAME/g, '*')
  }

  public patternRegexer(pattern: string, atNumber: boolean): RegExp {
    return new RegExp(
      '^' +
        pattern
          .replace(/[\/\\]/g, '[\\/\\\\]')
          .replace(/NUM/, this.numbersPattern(atNumber))
          .replace(/NAME/, '(.*)')
          .replace(/NUM/g, '\\1')
          .replace(/NAME/g, '\\2')
    )
  }


  private wildcardWithNumber(pattern: string, num: number, atNumbering: boolean): string {
    return pattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering, num)).replace(/NAME/g, '*')
  }

  private filenameFromParameters(pattern: string, num: string, name: string, atNumbering: boolean): string {
    return pattern.replace(/NUM/g, (atNumbering ? '@' : '') + num).replace(/NAME/g, sanitizeFileName(name))
  }

  private numberWildcardPortion(atNumbering: boolean, num: number | null = null) {
    let result = ''
    if (atNumbering) {
      result += '@'
    }
    if (num) {
      result += '*(0)' + num.toString()
    } else {
      result += '+(0|1|2|3|4|5|6|7|8|9)'
    }
    return result
  }
}
