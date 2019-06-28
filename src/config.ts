// module.exports.id = 'lib/config';

// https://codingsans.com/blog/node-config-best-practices

// import {string} from '@oclif/parser/lib/flags'
import * as jsonComment from 'comment-json'
import * as Convict from 'convict'
import * as d from 'debug'
import fs = require('fs');
import * as json from 'json5'
import path = require('path');
import { promisify } from "util";

import { sanitizeFileName } from './helpers'
const debug = d('config')
const loadFile = promisify(fs.readFile) as (path: string) => Promise<string>;
const loadFileSync = fs.readFileSync as (path: string) => string;

// const configLoaded = require('dotenv').config(); //{ debug: true }

// if (configLoaded.error) {
//     console.log(configLoaded.error);
// }

// Convict.addParser({ extension: 'json', parse: JSON.parse });

export interface ConfigObject {
  chapterPattern: string
  metadataPattern: string
  buildDirectory: string
}

export class Config {
  private readonly configSchemaObject: any = {
    // env: {
    //   doc: 'Either prod, dev or test.  By default prod.',
    //   format: ['prod', 'dev', 'test'],
    //   default: 'prod',
    //   env: 'NODE_ENV'
    // },
    chapterPattern: {
      doc: 'File naming pattern for chapter files. Use NUM for chapter number and NAME for chapter name.  Optionally use `/` for a folder structure, e.g. `NUM.NAME` or `NUM/NAME`.  Defaults to `NUM NAME`.',
      format: (val: string) => {
        if (!/^(?=.*NUM)(?=.*NAME).*$/.test(val)) {
          throw new Error('Must have NUM and NAME in pattern')
        }
      },
      default: 'NUM NAME'
      // ,
      // env: 'CHAPTER_PATTERN'
    },
    metadataPattern: {
      doc: 'File naming pattern for metadata files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Defaults to `NUM.metadata`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) { // && !/^$/.test(val)
          throw new Error('Must have NUM in pattern or be empty string')
        }
      },
      default: 'NUM.metadata'
      // ,
      // env: 'METADATA_PATTERN'
    },
    buildDirectory: {
      doc: 'Directory where to output builds done with Pandoc.  Defaults to `build/`.',
      default: 'build/'
    }
  }
  private readonly configSchema = Convict(this.configSchemaObject)
  // const private readonly dirname: string
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
      // debug(`configFileString = ${configFileString}`)
      const json5Config = jsonComment.parse(configFileString, undefined, true) // json.parse(configFileString)
      // debug(`json5Config.stringify = ${jsonComment.stringify(json5Config)}`)
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
    // delete jsonConfig.chapterPatternInput
    // delete jsonConfig.metadataPatternInput

    debug(`Config Object: ${json.stringify(jsonConfig)}`)
    return jsonConfig as ConfigObject
  }

  //TODO: remove 1 of 2 configDefaultsWithMeta
  public get configDefaultsWithMeta(): ConfigObject {
    const configDefaults: any = {}
    const jsonConfig = this.config
    const props = Object.keys(jsonConfig)
    // debug(`props=${props}`)

    for (let i = 0; i !== props.length; i++) {
      if (jsonConfig.hasOwnProperty(props[i])) {
        // debug(`default for prop ${props[i]}=${this.configSchema.default(props[i])}`)
        // debug(`documentation: ${'// ' + props[i]}: ${this.configSchemaObject[props[i]].doc}`)
        configDefaults['// ' + props[i]] = this.configSchemaObject[props[i]].doc
        configDefaults[props[i]] = this.configSchema.default(props[i])
      }
    }
    // debug(`configDefaults object = ${json.stringify(configDefaults)}`)
    return configDefaults
  }

  public get configDefaultsWithMetaString(): string {
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
        configDefaultsString += this.configSchema.default(props[i])
        configDefaultsString += `",\n`
      }
    }
    configDefaultsString = configDefaultsString.replace(/(.*),\n$/, '$1')
    configDefaultsString += '\n}'
    // debug(`configDefaultsString = ${configDefaultsString}`)
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

  public chapterFileNameFromParameters(num: string, name: string): string {
    return this.config.chapterPattern.replace('NUM', num).replace('NAME', name) + '.md'
  }

  public metadataFileNameFromParameters(num: string, name: string): string {
    return this.config.metadataPattern.replace('NUM', num).replace('NAME', name) + '.json'
  }

  public get buildDirectory(): string {
    return path.join(this.rootPath, this.config.buildDirectory)
  }
}
