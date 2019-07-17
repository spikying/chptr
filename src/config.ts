// https://codingsans.com/blog/node-config-best-practices
import * as jsonComment from 'comment-json'
import * as Convict from 'convict'
import * as d from 'debug'
import fs = require('fs')
// import * as json from 'json5'
import moment = require('moment')
import * as path from 'path'

import { sanitizeFileName } from './commands/base'

const debug = d('config')
const loadFileSync = fs.readFileSync as (path: string) => string

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

export class Config {
  public get config(): ConfigObject {
    const jsonConfig: any = this.configSchema.getProperties() // so we can operate with a plain old JavaScript object and abstract away convict (optional)
    // debug(`chapter pre-Sanitize: ${jsonConfig.chapterPattern}`)
    jsonConfig.chapterPattern = sanitizeFileName(jsonConfig.chapterPattern, true)
    jsonConfig.metadataPattern = sanitizeFileName(jsonConfig.metadataPattern, true)
    jsonConfig.summaryPattern = sanitizeFileName(jsonConfig.summaryPattern, true)
    jsonConfig.metadataFields = {
      manual: JSON.parse(jsonConfig.metadataFields),
      computed: { title: '###', wordCount: 0 },
      extracted: {}
    }

    // debug(`Config Object: ${json.stringify(jsonConfig, null, 2)}`)
    return jsonConfig as ConfigObject
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

  private readonly metadataCustomFieldsObject = {
    datetimeRange: '',
    revisionSteps: {
      draft: false,
      language: false,
      style: { wordRepetitions: false, languageLevel: false },
      dialogs: false,
      questAnalysis: false,
      tenPercentCut: false
    },
    characters: [],
    mainCharacter: '',
    mainCharacterQuest: '',
    otherQuest: ''
  }
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
      doc: 'Font to use for the rendering engines that use it',
      default: ''
    },
    fontSize: {
      //TODO: use parameter?
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
    },
    metadataFields: {
      doc: 'All fields to be added in each Metadata file.  JSON.stringified string.',
      format: String,
      default: JSON.stringify(JSON.stringify(this.metadataCustomFieldsObject))
    }
  }
  private readonly configSchema = Convict(this.configSchemaObject)
  private readonly hardConfig: HardConfig
  private readonly rootPath: string

  constructor(dirname: string, readFromFile = true) {
    this.hardConfig = new HardConfig(dirname)
    this.rootPath = path.join(dirname)
    // this.configPathName = path.join(this.rootPath, './config/')
    // this.configFileName = path.join(this.configPathName, 'config.json5')

    if (readFromFile) {
      try {
        fs.accessSync(this.hardConfig.configFilePath, fs.constants.R_OK)
      } catch (err) {
        throw new Error(`File ${this.hardConfig.configFilePath} either doesn't exist or is not readable by process.\n${err}`)
      }

      let configFileString = ''
      try {
        configFileString = loadFileSync(this.hardConfig.configFilePath)
        // debug(`configFileString=${configFileString}`)
      } catch (err) {
        debug(err)
      }

      try {
        const json5Config = jsonComment.parse(configFileString, undefined, true)
        // debug(`json5Config object: ${JSON.stringify(json5Config, null, 2)}`)
        this.configSchema.load(json5Config)
        // this.configSchema.loadFile(this.configFileName)

        // if (readFromFile) {
        this.configSchema.validate() //({ allowed: 'strict' }) // 'strict' throws error if config does not conform to schema
        // }

        // debug(`Loaded config from ${this.hardConfig.configFilePath}:\n${jsonComment.stringify(json5Config)}`)
      } catch (err) {
        throw new Error(`loading config error: ${err.toString().infoColor()}`.errorColor())
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
      if (jsonConfig.hasOwnProperty(props[i])) {
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
    return this.wildcard(this.config.chapterPattern, atNumbering)
    // return this.config.chapterPattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering)).replace(/NAME/g, '*') //+ '.md'
  }
  public metadataWildcard(atNumbering: boolean): string {
    return this.wildcard(this.config.metadataPattern, atNumbering)
    // return this.config.metadataPattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering)).replace(/NAME/g, '*') //+ '.json'
  }
  public summaryWildcard(atNumbering: boolean): string {
    return this.wildcard(this.config.summaryPattern, atNumbering)
    // return this.config.summaryPattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering)).replace(/NAME/g, '*') //+ '.md'
  }

  public chapterWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.wildcardWithNumber(this.config.chapterPattern, num, atNumbering)
    // return this.config.chapterPattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering, num)).replace(/NAME/g, '*') // + '.md'
  }
  public metadataWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.wildcardWithNumber(this.config.metadataPattern, num, atNumbering)
    // return this.config.metadataPattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering, num)).replace(/NAME/g, '*') // + '.json'
  }
  public summaryWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.wildcardWithNumber(this.config.summaryPattern, num, atNumbering)
    // return this.config.summaryPattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering, num)).replace(/NAME/g, '*') //+ '.md'
  }

  public chapterFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.filenameFromParameters(this.config.chapterPattern, num, name, atNumbering)
    // return this.config.chapterPattern.replace(/NUM/g, (atNumbering ? '@' : '') + num).replace(/NAME/g, sanitizeFileName(name))
  }

  public metadataFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.filenameFromParameters(this.config.metadataPattern, num, name, atNumbering) // return this.config.metadataPattern.replace(/NUM/g, (atNumbering ? '@' : '') + num).replace(/NAME/g, sanitizeFileName(name))
  }

  public summaryFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.filenameFromParameters(this.config.summaryPattern, num, name, atNumbering)
    // return this.config.summaryPattern.replace(/NUM/g, (atNumbering ? '@' : '') + num).replace(/NAME/g, sanitizeFileName(name))
  }

  public chapterRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.chapterPattern, atNumber)
    // return new RegExp(
    //   '^' +
    //     this.config.chapterPattern
    //       .replace(/[\/\\]/g, '[\\/\\\\]')
    //       .replace(/NUM/g, this.numbersPattern(atNumber))
    //       .replace(/NAME/g, '(.*)')
    // )
  }

  public metadataRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.metadataPattern, atNumber)
    // return new RegExp(
    //   '^' +
    //     this.config.metadataPattern
    //       .replace(/[\/\\]/g, '[\\/\\\\]')
    //       .replace(/NUM/g, this.numbersPattern(atNumber))
    //       .replace(/NAME/g, '(.*)')
    // )
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

  public antidotePathName(chapterFilename: string): string {
    return path.join(this.projectRootPath, chapterFilename.replace(/\.\w+$/, '.antidote'))
  }

  private wildcard(pattern: string, atNumbering: boolean): string {
    return pattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering)).replace(/NAME/g, '*')
  }

  private wildcardWithNumber(pattern: string, num: number, atNumbering: boolean): string {
    return pattern.replace(/NUM/g, this.numberWildcardPortion(atNumbering, num)).replace(/NAME/g, '*')
  }

  private filenameFromParameters(pattern: string, num: string, name: string, atNumbering: boolean): string {
    return pattern.replace(/NUM/g, (atNumbering ? '@' : '') + num).replace(/NAME/g, sanitizeFileName(name))
  }

  private patternRegexer(pattern: string, atNumber: boolean): RegExp {
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

export class HardConfig {
  public get configPath(): string {
    return this.configPathName
  }
  public get configFilePath(): string {
    return this.configFileName
  }

  public get emptyFilePath(): string {
    return path.join(this.configPathName, 'empty.md')
  }

  public get readmeFilePath(): string {
    return path.join(this.rootPath, 'readme.md')
  }

  public get gitignoreFilePath(): string {
    return path.join(this.rootPath, '.gitignore')
  }

  public get gitattributesFilePath(): string {
    return path.join(this.rootPath, '.gitattributes')
  }

  public emptyFileString = `
# {TITLE}

`

  private readonly rootPath: string
  private readonly configPathName: string
  private readonly configFileName: string

  constructor(dirname: string) {
    this.rootPath = path.join(dirname)
    this.configPathName = path.join(this.rootPath, './config/')
    this.configFileName = path.join(this.configPathName, 'config.json5')

    try {
      const emptyFileString = loadFileSync(this.emptyFilePath)
      this.emptyFileString = emptyFileString
    } catch (err) {
      debug(err)
    }
  }
}
