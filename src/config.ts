// https://codingsans.com/blog/node-config-best-practices
import * as jsonComment from 'comment-json'
import * as Convict from 'convict'
import * as d from 'debug'
import fs = require('fs')
import * as json from 'json5'
import moment = require('moment')
import * as path from 'path'

import { sanitizeFileName } from './Commands/base'

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

    jsonConfig.chapterPattern = sanitizeFileName(jsonConfig.chapterPattern)
    jsonConfig.metadataPattern = sanitizeFileName(jsonConfig.metadataPattern)
    jsonConfig.metadataFields = {
      manual: jsonConfig.metadataFields,
      computed: { title: '###', wordCount: 0 },
      extracted: {},
    }

    debug(`Config Object: ${json.stringify(jsonConfig)}`)
    return jsonConfig as ConfigObject
  }

  public get projectRootPath(): string {
    return this.rootPath
  }
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
  public emptyFileString = `
# {TITLE}

`

  private readonly configSchemaObject: any = {
    chapterPattern: {
      doc:
        'File naming pattern for chapter files. Use NUM for chapter number and NAME for chapter name.  Optionally use `/` for a folder structure, e.g. `NUM.NAME` or `NUM/NAME`.  Defaults to `NUM NAME`.',
      format: (val: string) => {
        if (!/^(?=.*NUM)(?=.*NAME).*$/.test(val)) {
          throw new Error('Must have NUM and NAME in pattern')
        }
      },
      default: 'NUM NAME',
    },
    metadataPattern: {
      doc:
        'File naming pattern for metadata files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Defaults to `NUM.metadata`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) {
          // && !/^$/.test(val)
          throw new Error('Must have NUM in pattern')
        }
      },
      default: 'NUM.metadata',
    },
    summaryPattern: {
      doc:
        'File naming pattern for summary files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Defaults to `NUM.summary`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) {
          // && !/^$/.test(val)
          throw new Error('Must have NUM in pattern')
        }
      },
      default: 'NUM.summary',
    },
    buildDirectory: {
      doc: 'Directory where to output builds done with Pandoc.  Defaults to `build/`.',
      default: 'build/',
    },
    projectTitle: {
      doc: 'Title for the project.  Will be used as a head title in renderings.',
      default: 'MyNovel',
    },
    projectAuthor: {
      name: {
        doc: 'Author for the project.',
        default: '---',
      },
      email: {
        doc: 'Author for the project.',
        default: '---',
        format: 'email',
      },
    },
    projectLang: {
      doc: 'Project language',
      default: 'en',
    },
    fontName: {
      doc: 'Font to use for the rendering engines that use it',
      default: 'Arial',
    },
    fontSize: {
      doc: 'Font size for the rendering engines that use it',
      default: '12pt',
    },
    numberingStep: {
      doc: 'Increment step when numbering files',
      default: 1,
    },
    numberingInitial: {
      doc: 'Initial file number',
      default: 1,
    },
    metadataFields: {
      doc: 'All fields to be added in each Metadata file',
      default: {
        datetimeRange: '',
        revisionStep: 0,
        characters: [],
        mainCharacter: '',
        mainCharacterQuest: '',
        otherQuest: '',
      },
    },
  }
  private readonly configSchema = Convict(this.configSchemaObject)
  private readonly rootPath: string
  private readonly configPathName: string
  private readonly configFileName: string

  constructor(dirname: string) {
    this.rootPath = path.join(dirname)
    this.configPathName = path.join(this.rootPath, './config/')
    this.configFileName = path.join(this.configPathName, 'config.json5')

    try {
      const configFileString = loadFileSync(this.configFileName)
      const json5Config = jsonComment.parse(configFileString, undefined, true)
      this.configSchema.load(json5Config)
      debug(`Loaded config from ${this.configFileName}:\n${jsonComment.stringify(json5Config)}`)
    } catch (err) {
      debug(err)
    }

    const emptyFileString = loadFileSync(this.emptyFilePath)
    this.emptyFileString = emptyFileString

    this.configSchema.validate({ allowed: 'strict' }) // 'strict' throws error if config does not conform to schema
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
          val = `"${val}"`
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
    return this.config.chapterPattern.replace('NUM', this.numberWildcardPortion(atNumbering)).replace('NAME', '*') + '.md'
  }
  public metadataWildcard(atNumbering: boolean): string {
    return this.config.metadataPattern.replace('NUM', this.numberWildcardPortion(atNumbering)).replace('NAME', '*') + '.json'
  }
  public summaryWildcard(atNumbering: boolean): string {
    return this.config.summaryPattern.replace('NUM', this.numberWildcardPortion(atNumbering)).replace('NAME', '*') + '.md'
  }

  public chapterWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.config.chapterPattern.replace('NUM', this.numberWildcardPortion(atNumbering, num)).replace('NAME', '*') + '.md'
  }
  public metadataWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.config.metadataPattern.replace('NUM', this.numberWildcardPortion(atNumbering, num)).replace('NAME', '*') + '.json'
  }
  public summaryWildcardWithNumber(num: number, atNumbering: boolean): string {
    return this.config.summaryPattern.replace('NUM', this.numberWildcardPortion(atNumbering, num)).replace('NAME', '*') + '.md'
  }

  public chapterFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.config.chapterPattern.replace('NUM', (atNumbering ? '@' : '') + num).replace('NAME', sanitizeFileName(name)) + '.md'
  }

  public metadataFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.config.metadataPattern.replace('NUM', (atNumbering ? '@' : '') + num).replace('NAME', sanitizeFileName(name)) + '.json'
  }

  public summaryFileNameFromParameters(num: string, name: string, atNumbering: boolean): string {
    return this.config.summaryPattern.replace('NUM', (atNumbering ? '@' : '') + num).replace('NAME', sanitizeFileName(name)) + '.md'
  }

  public chapterRegex(atNumber: boolean): RegExp {
    return new RegExp('^' + this.config.chapterPattern.replace('NUM', this.numbersPattern(atNumber)).replace('NAME', '(.*)'))
  }

  public metadataRegex(atNumber: boolean): RegExp {
    return new RegExp('^' + this.config.metadataPattern.replace('NUM', this.numbersPattern(atNumber)).replace('NAME', '(.*)'))
  }

  public numbersPattern(atNumber: boolean): string {
    return atNumber ? '@(\\d+)' : '(\\d+)'
  }

  public isAtNumbering(filename: string): boolean {
    const re = new RegExp(this.numbersPattern(true))
    return re.exec(filename) !== null
  }

  public antidotePathName(chapterFilename: string): string {
    return path.join(this.projectRootPath, chapterFilename.replace(/\.md$/, '.antidote'))
  }
  private numberWildcardPortion(atNumbering: boolean, num: number | null = null) {
    let result = ''
    if (atNumbering) {
      result += '\\@'
    }
    if (num) {
      result += '*(0)' + num.toString()
    } else {
      result += '+(0|1|2|3|4|5|6|7|8|9)'
    }
    return result
  }
}
