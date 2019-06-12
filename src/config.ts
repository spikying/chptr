// module.exports.id = 'lib/config';

// https://codingsans.com/blog/node-config-best-practices

const Path = require('path')
const Fs = require('fs')
import {string} from '@oclif/parser/lib/flags'
import * as jsonComment from 'comment-json'
import * as Convict from 'convict'
import * as d from 'debug'
import * as json from 'json5'

import {sanitizeFileName} from './helpers'
const debug = d('config')
// const configLoaded = require('dotenv').config(); //{ debug: true }

// if (configLoaded.error) {
//     console.log(configLoaded.error);
// }

// Convict.addParser({ extension: 'json', parse: JSON.parse });

export interface ConfigObject {
  chapterPattern: string
  metadataPattern: string
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
      doc:
        'File naming pattern for chapter files. Use NUM for chapter number, NAME for chapter name and REV for optional revision number.  Optionally use `/` for a folder structure, e.g. `NUM.NAME` or `NUM/NAME (REV)`.  Defaults to `NUM NAME`.',
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
      doc:
        'File naming pattern for metadata files.  Use NUM for chapter number, NAME for optional chapter name and REV for optional revision number.  Optionally use `/` for a folder structure.  Put an empty string to include metadata in chapter headers.  Defaults to `NUM Metadata`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) {
          throw new Error('Must have NUM and NAME in pattern')
        }
      },
      default: 'NUM Metadata'
      // ,
      // env: 'METADATA_PATTERN'
    }
  }
  private readonly configSchema = Convict(this.configSchemaObject)
  // const private readonly dirname: string
  private readonly configPathName: string // = Path.join(__dirname, './config/')
  private readonly configFileName: string // = Path.join(this.configPathName, 'config.json5')

  constructor(dirname: string) {
    // this.dirname = dirname
    this.configPathName = Path.join(dirname, './config/')
    this.configFileName = Path.join(this.configPathName, 'config.json5')
    debug(`configPathName = ${this.configPathName}`)
    debug(`configFileName = ${this.configFileName}`)

    try {
      const json5Config = json.parse(Fs.readFileSync(this.configFileName))
      this.configSchema.load(jsonComment.parse(json5Config, undefined, true))
      debug(`Loaded config from ${this.configFileName}`)
    } catch (error) {
      debug(error)
    }

    this.configSchema.validate({allowed: 'strict'}) // 'strict' throws error if config does not conform to schema
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

  public get configDefaultsWithMeta(): ConfigObject {
    const configDefaults: any = {}
    const jsonConfig = this.config
    // const props: string[] = Object.keys(jsonConfig)
    // for (let i = 0; i !== props.length; i++) {
    //   if (jsonConfig.hasOwnProperty(jsonConfig[props[i]])) {
    //     const schemaItem: any = this.configSchemaObject[props[i]]
    //     debug(`schemaItem = ${schemaItem}`)
    //     configDefaults['// ' + props[i]] = schemaItem.doc || ''
    //     configDefaults[props[i]] = this.configSchema.default(props[i])
    //   }
    // }
    const props = Object.keys(jsonConfig)
    debug(`props=${props}`)
    for (let i = 0; i !== props.length; i++) {
      // debug(`props[i]=${props[i]}`)
      // debug(`jsonConfig[props[i]]=${jsonConfig[props[i]]}`)
      if (jsonConfig.hasOwnProperty(props[i])) {
        debug(
          `default for prop ${props[i]}=${this.configSchema.default(props[i])}`
        )
        debug(
          `documentation: ${'// ' + props[i]}: ${
            this.configSchemaObject[props[i]].doc
          }`
        )
        configDefaults['// ' + props[i]] = this.configSchemaObject[ props[i]
].doc
        configDefaults[props[i]] = this.configSchema.default(props[i])
      }
    }
    debug(`configDefaults object = ${json.stringify(configDefaults)}`)
    return configDefaults
  }

  public get configPath(): string {
    return this.configPathName
  }
  public get configFilePath(): string {
    return this.configFileName
  }

  public get emptyFilePath(): string {
    return Path.join(this.configPathName, 'empty.md')
  }
  public get emptyFileString(): string {
    return `
# {TITLE}
`
  }
}

// const configDefaults: any = {}
// const props = Object.keys(jsonConfig)
// for (let i = 0; i !== props.length; i++) {
//   if (jsonConfig.hasOwnProperty(jsonConfig[props[i]])) {
//     configDefaults[props[i]] = configSchema.default(props[i])
//   }
// }

// export const defaults: ConfigObject = configDefaults as ConfigObject
