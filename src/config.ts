// module.exports.id = 'lib/config';

// https://codingsans.com/blog/node-config-best-practices

// import {string} from '@oclif/parser/lib/flags'
import * as jsonComment from 'comment-json'
import * as Convict from 'convict'
import * as d from 'debug'
import fs = require('fs');
import * as json from 'json5'
import path = require('path');
// import { promisify } from "util";

import { sanitizeFileName } from './helpers'
const debug = d('config')
// const loadFile = promisify(fs.readFile) as (path: string) => Promise<string>;
const loadFileSync = fs.readFileSync as (path: string) => string;

export interface ConfigObject {
  chapterPattern: string // | ConfigProperty
  metadataPattern: string // | ConfigProperty
  summaryPattern: string
  buildDirectory: string // | ConfigProperty
  projectTitle: string // | ConfigProperty
  projectAuthor: string // | ConfigProperty
  projectLang: string // | ConfigProperty
  fontName: string // | ConfigProperty
  fontSize: string // | ConfigProperty
}

// interface ConfigProperty {
//   doc: string
//   default: string
//   format?(val: string): void
// }

export class Config {
  private readonly configSchemaObject: any = {
    chapterPattern: {
      doc: 'File naming pattern for chapter files. Use NUM for chapter number and NAME for chapter name.  Optionally use `/` for a folder structure, e.g. `NUM.NAME` or `NUM/NAME`.  Defaults to `NUM NAME`.',
      format: (val: string) => {
        if (!/^(?=.*NUM)(?=.*NAME).*$/.test(val)) {
          throw new Error('Must have NUM and NAME in pattern')
        }
      },
      default: 'NUM NAME'
    },
    metadataPattern: {
      doc: 'File naming pattern for metadata files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Defaults to `NUM.metadata`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) { // && !/^$/.test(val)
          throw new Error('Must have NUM in pattern')
        }
      },
      default: 'NUM.metadata'
    },
    summaryPattern: {
      doc: 'File naming pattern for summary files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Defaults to `NUM.summary`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) { // && !/^$/.test(val)
          throw new Error('Must have NUM in pattern')
        }
      },
      default: 'NUM.summary'
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
      doc: 'Author for the project.',
      default: '---'
    },
    projectLang: {
      doc: 'Project language',
      default: 'en'
    },
    fontName: {
      doc: 'Font to use for the rendering engines that use it',
      default: 'Arial'
    },
    fontSize: {
      doc: 'Font size for the rendering engines that use it',
      default: '12pt'
    }
  }
  private readonly configSchema = Convict(this.configSchemaObject)
  private readonly rootPath: string
  private readonly configPathName: string // = Path.join(__dirname, './config/')
  private readonly configFileName: string // = Path.join(this.configPathName, 'config.json5')

  constructor(dirname: string) {
    // this.dirname = dirname
    this.rootPath = path.join(dirname)
    this.configPathName = path.join(this.rootPath, './config/')
    this.configFileName = path.join(this.configPathName, 'config.json5')
    debug(`configPathName = ${this.configPathName}`)
    debug(`configFileName = ${this.configFileName}`)

    try {
      const configFileString: string = loadFileSync(this.configFileName)
      const json5Config = jsonComment.parse(configFileString, undefined, true) // json.parse(configFileString)
      this.configSchema.load(json5Config) //jsonComment.parse(json5Config, undefined, true))
      debug(`Loaded config from ${this.configFileName}:\n${jsonComment.stringify(json5Config)}`)
    } catch (err) {
      debug(err)
    }

    this.configSchema.validate({ allowed: 'strict' }) // 'strict' throws error if config does not conform to schema
  }

  public get config(): ConfigObject {
    const jsonConfig: any = this.configSchema.getProperties() // so we can operate with a plain old JavaScript object and abstract away convict (optional)

    jsonConfig.chapterPattern = sanitizeFileName(jsonConfig.chapterPattern)
    jsonConfig.metadataPattern = sanitizeFileName(jsonConfig.metadataPattern)

    debug(`Config Object: ${json.stringify(jsonConfig)}`)
    return jsonConfig as ConfigObject
  }

  public configDefaultsWithMetaString(overrideObj?: object): string {
    const overrideObj2: any = overrideObj || {}
    const jsonConfig = this.config
    const props = Object.keys(jsonConfig)
    // debug(`props=${props}`)
    const spaces = 4
    let configDefaultsString = '{\n'

    for (let i = 0; i !== props.length; i++) {
      if (jsonConfig.hasOwnProperty(props[i])) {
        // debug(`default for prop ${props[i]}=${this.configSchema.default(props[i])}`)
        // debug(`documentation: ${'// ' + props[i]}: ${this.configSchemaObject[props[i]].doc}`)
        configDefaultsString += ' '.repeat(spaces)
        configDefaultsString += '// '
        configDefaultsString += this.configSchemaObject[props[i]].doc
        configDefaultsString += '\n'
        configDefaultsString += ' '.repeat(spaces)
        configDefaultsString += `"`
        configDefaultsString += props[i]
        configDefaultsString += `"`
        configDefaultsString += `: "`
        configDefaultsString += (overrideObj2[props[i]]) || this.configSchema.default(props[i])
        configDefaultsString += `",\n`
      }
    }
    configDefaultsString = configDefaultsString.replace(/(.*),\n$/, '$1')
    configDefaultsString += '\n}'
    debug(`configDefaultsString = ${configDefaultsString}`)
    return configDefaultsString
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
  public get emptyFileString(): string {
    return `
# {TITLE}
`
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

  public get chapterWildcard(): string {
    return this.config.chapterPattern.replace('NUM', '+(0|1|2|3|4|5|6|7|8|9)').replace('NAME', '*') + '.md'
  }
  public chapterWildcardWithNumber(num: number): string {
    return this.config.chapterPattern.replace('NUM', '*(0)' + num.toString()).replace('NAME', '*') + '.md'
  }
  public get metadataWildcard(): string {
    return this.config.metadataPattern.replace('NUM', '+(0|1|2|3|4|5|6|7|8|9)').replace('NAME', '*') + '.md'
  }
  public summaryWildcardWithNumber(num: number): string {
    return this.config.summaryPattern.replace('NUM', '*(0)' + num.toString()).replace('NAME', '*') + '.md'
  }
  public metadataWildcardWithNumber(num: number): string {
    return this.config.metadataPattern.replace('NUM', '*(0)' + num.toString()).replace('NAME', '*') + '.json'
  }

  public chapterFileNameFromParameters(num: string, name: string): string {
    return this.config.chapterPattern.replace('NUM', num).replace('NAME', name) + '.md'
  }

  public metadataFileNameFromParameters(num: string, name: string): string {
    return this.config.metadataPattern.replace('NUM', num).replace('NAME', name) + '.json'
  }

  public summaryFileNameFromParameters(num: string, name: string): string {
    return this.config.summaryPattern.replace('NUM', num).replace('NAME', name) + '.md'
  }

  public get buildDirectory(): string {
    return path.join(this.rootPath, this.config.buildDirectory)
  }

  public get globalMetadataContent(): string {
    return `---
title: ${this.config.projectTitle}
author: ${this.config.projectAuthor}
lang: ${this.config.projectLang}
fontsize: ${this.config.fontSize}
...

`
  }
}
