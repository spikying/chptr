// https://codingsans.com/blog/node-config-best-practices
import { cli } from 'cli-ux'
import * as jsonComment from 'comment-json'
import * as Convict from 'convict'
import * as d from 'debug'
// import { applyDiff } from 'deep-diff'
import yaml = require('js-yaml')
import moment = require('moment')
import * as path from 'path'
import * as YAML from 'yaml'

import { ChapterId } from './chapter-id'
import { ChptrError } from './chptr-error'
import { FsUtils } from './fs-utils'
import { HardConfig } from './hard-config'
import { Singleton, AutoWired, Container } from 'typescript-ioc'

const debug = d('config:soft')

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
  filesWithChapterNumbersInContent: string[]
  propEquivalents: PropEquivalent[]
}

export interface Author {
  name: string
  email: string
}

@Singleton
// @AutoWired
export class SoftConfig {
  public get config(): ConfigObject {
    if (!this._config) {
      //   return this._config as ConfigObject
      // } else {
      const jsonConfig: any = this.configSchema.getProperties() // so we can operate with a plain old JavaScript object and abstract away convict (optional)
      jsonConfig.chapterPattern = this.fsUtils.sanitizeFileName(jsonConfig.chapterPattern, true)
      jsonConfig.metadataPattern = this.fsUtils.sanitizeFileName(
        jsonConfig.metadataPattern.replace(/\.<ext>$/, `.${this.configStyle.toLowerCase()}`),
        true
      )
      jsonConfig.summaryPattern = this.fsUtils.sanitizeFileName(jsonConfig.summaryPattern, true)
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

  public get buildDirectory(): string {
    return path.join(this.rootPath, this.config.buildDirectory)
  }

  public get filesWithChapterNumbersInContent(): string[] {
    return this.config.filesWithChapterNumbersInContent.map(f => path.join(this.rootPath, f))
  }

  public get globalMetadataContent(): string {
    return `---
title: ${this.config.projectTitle}
author: ${this.config.projectAuthor.name}
lang: ${this.config.projectLang}
fontfamily: ${this.config.fontName}
fontsize: ${this.config.fontSize}
date: ${moment().format('D MMMM YYYY')}
papersize: letter
classoption: oneside
documentclass: bookest
...

`
  }

  public get emptyFileString(): string {
    if (!this._emptyFileString) {
      try {
        const content = this.fsUtils.loadFileSync(this.hardConfig.emptyFilePath)
        this._emptyFileString = content
      } catch (err) {
        cli.warn(`Could not read from an empty file template at ${this.hardConfig.emptyFilePath}.  Serving default empty file template.`)
        debug(err)
        return this.hardConfig.templateEmptyFileString
      }
    }
    return this._emptyFileString
  }

  private _wordCountObject: WordCountObject[] = []

  public set WordCountData(value: WordCountObject[]) {
    const uniqueValue = []
    const map = new Map()
    for (const item of value) {
      if (!map.has(item.date.format('YYYY-MM-DD'))) {
        map.set(item.date.format('YYYY-MM-DD'), true)
        uniqueValue.push(item)
      }
    }
    this._wordCountObject = uniqueValue

    const wordCountFilePath = path.join(this.buildDirectory, `wordCountData.${this.configStyle.toLowerCase()}`)
    const dto: WordCountDTO[] = this._wordCountObject.map(o => {
      const v: WordCountDTO = {
        date: o.date.format('YYYY-MM-DD'),
        wordCountChapterTotal: o.wordCountChapterTotal,
        wordCountSummaryTotal: o.wordCountSummaryTotal,
        wordCountChapterDiff: o.wordCountChapterDiff,
        wordCountSummaryDiff: o.wordCountSummaryDiff
      }
      return v
    })
    this.fsUtils.writeFile(wordCountFilePath, this.stringifyPerStyle(dto))
  }
  public get WordCountData(): WordCountObject[] {
    const wordCountFilePath = path.join(this.buildDirectory, `wordCountData.${this.configStyle.toLowerCase()}`)
    const getFromFile = () => {
      try {
        const wordCountContent = this.fsUtils.loadFileSync(wordCountFilePath)
        const wco: WordCountDTO[] = this.parsePerStyle(wordCountContent)
        this._wordCountObject = wco.map<WordCountObject>(o => {
          const v: WordCountObject = {
            date: moment(o.date),
            wordCountChapterTotal: o.wordCountChapterTotal,
            wordCountSummaryTotal: o.wordCountSummaryTotal,
            wordCountChapterDiff: o.wordCountChapterDiff,
            wordCountSummaryDiff: o.wordCountSummaryDiff
          }
          return v
        })
      } catch (err) {
        cli.warn('No existing wordCount file')
      }

      return this._wordCountObject
    }
    return this._wordCountObject.length > 0 ? this._wordCountObject : getFromFile()
  }

  // public templateReadmeString = `\n# ${this.config.projectTitle}\n\nA novel by ${this.config.projectAuthor.name}.`

  private _config: ConfigObject | undefined
  private readonly _metadataFieldsObj: any

  private readonly configSchemaObject: any = {
    chapterPattern: {
      doc:
        'File naming pattern for chapter files. Use NUM for chapter number and NAME for chapter name.  Optionally use `/` for a folder structure, e.g. `NUM.NAME.md` or `NUM/NAME.chptr`.',
      format: (val: string) => {
        if (!/^(?=.*NUM)(?=.*NAME).*$/.test(val)) {
          throw new ChptrError('Must have NUM and NAME in pattern', 'soft-config:configschemaobject:chapterpattern', 300)
        }
        const numPos = val.indexOf('NUM')
        const namePos = val.indexOf('NAME')
        if (namePos < numPos) {
          throw new ChptrError('First NUM must be before first NAME in pattern', 'soft-config:configschemaobject:chapterpattern', 301)
        }
      },
      default: 'NUM NAME.chptr'
    },
    metadataPattern: {
      doc:
        'File naming pattern for metadata files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Filename extension .<ext> will be replaced by either `.json5` or `.yaml`.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) {
          // && !/^$/.test(val)
          throw new ChptrError('Must have NUM in pattern', 'soft-config:configschemaobject:metadatapattern', 302)
        }
        if (/^(?=.*NAME).*$/.test(val)) {
          const numPos = val.indexOf('NUM')
          const namePos = val.indexOf('NAME')
          if (namePos < numPos) {
            throw new ChptrError('First NUM must be before first NAME in pattern', 'soft-config:configschemaobject:metadatapattern', 303)
          }
        }
      },
      default: 'NUM.metadata.json'
    },
    summaryPattern: {
      doc:
        'File naming pattern for summary files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure.',
      format: (val: string) => {
        if (!/^(?=.*NUM).*$/.test(val)) {
          // && !/^$/.test(val)
          throw new ChptrError('Must have NUM in pattern', 'soft-config:configschemaobject:summarypattern', 304)
        }
        if (/^(?=.*NAME).*$/.test(val)) {
          const numPos = val.indexOf('NUM')
          const namePos = val.indexOf('NAME')
          if (namePos < numPos) {
            throw new ChptrError('First NUM must be before first NAME in pattern', 'soft-config:configschemaobject.summarypattern', 305)
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
            throw new ChptrError('Must have an author name', 'soft-config:configschemaobject.author', 306)
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
      doc: 'Font to use for the rendering engines that use it',
      default: ''
    },
    fontSize: {
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
    filesWithChapterNumbersInContent: {
      doc: 'File paths to files containing chapter numbers, to have them follow in reorder and compact operations.',
      default: []
    },
    propEquivalents: {
      doc:
        'When extracting props metadata, coalesce `arr` values to `final` value.  Each object in array must contain `arr` array of strings and `final` string.',
      default: []
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
  private readonly fsUtils: FsUtils

  private _emptyFileString = ''
  private _configStyle = ''

  public set configStyle(value: string) {
    if (value === 'YAML' || value === 'JSON5') {
      this._configStyle = value
    } else {
      throw new ChptrError('Cannot set config style to something else than YAML or JSON5', 'soft-config:configstyle.set', 306)
    }
  }
  public get configStyle(): string {
    if (!this._configStyle) {
      try {
        this.fsUtils.accessSync(this.hardConfig.configJSON5FilePath)
        this._configStyle = 'JSON5'
      } catch {
        try {
          this.fsUtils.accessSync(this.hardConfig.configYAMLFilePath)
          this._configStyle = 'YAML'
        } catch (err) {
          throw new ChptrError(
            `File ${this.hardConfig.configJSON5FilePath} or ${this.hardConfig.configYAMLFilePath} either doesn't exist or is not readable by process.\n${err}`,
            'soft-config:configstyle.get',
            307
          )
        }
      }
    }
    return this._configStyle
  }

  public get configFilePath(): string {
    return this.configStyle === 'JSON5'
      ? this.hardConfig.configJSON5FilePath
      : this.configStyle === 'YAML'
      ? this.hardConfig.configYAMLFilePath
      : ''
  }
  constructor(dirname: string, readFromFile = true) {
    debug('CONSTRUCTOR SOFT-CONFIG')
    this.hardConfig = Container.get(HardConfig) //new HardConfig(dirname)
    this.rootPath = path.join(dirname)
    this.fsUtils = new FsUtils()

    if (readFromFile) {
      let configFileString = ''
      let metadataFieldsString = ''
      let objConfig = {}

      try {
        if (this.configStyle === 'JSON5') {
          configFileString = this.fsUtils.loadFileSync(this.hardConfig.configJSON5FilePath)
          metadataFieldsString = this.fsUtils.loadFileSync(this.hardConfig.metadataFieldsJSON5FilePath)

          objConfig = jsonComment.parse(configFileString, undefined, true)
          this._metadataFieldsObj = jsonComment.parse(metadataFieldsString, undefined, false)
        } else if (this.configStyle === 'YAML') {
          configFileString = this.fsUtils.loadFileSync(this.hardConfig.configYAMLFilePath)
          metadataFieldsString = this.fsUtils.loadFileSync(this.hardConfig.metadataFieldsYAMLFilePath)

          // const yamlOptions = { keepBlobsInJSON: false, prettyErrors: true }
          debug(`configFileString:\n${configFileString}`)
          objConfig = yaml.safeLoad(configFileString)
          debug(`objConfig = ${JSON.stringify(objConfig)}`)
          this._metadataFieldsObj = yaml.safeLoad(metadataFieldsString)
          debug(`_metadataFieldsObj = ${JSON.stringify(this._metadataFieldsObj)}`)
        } else {
          throw new ChptrError('config style must be JSON5 or YAML', 'soft-config:ctor', 308)
        }
      } catch (err) {
        debug(err.toString().errorColor())
        throw new ChptrError(`loading or processing config files error: ${err.toString().infoColor()}`, 'soft-config.ctor', 200)
      }

      try {
        this.configSchema.load(objConfig)
        this.configSchema.validate({ allowed: 'strict' }) // 'strict' throws error if config does not conform to schema
      } catch (err) {
        throw new ChptrError(`processing config data error: ${err.toString().infoColor()}`, 'soft-config:ctor', 309)
      }
    }
  }

  public configDefaultsWithMetaJSON5String(overrideObj: any): string {
    overrideObj = overrideObj || {}
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
        let val = overrideObj[props[i]] || this.configSchema.default(props[i])
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
    // debug(`configDefaultsString = ${configDefaultsString}`)
    return configDefaultsString
  }
  public configDefaultsWithMetaYAMLString(overrideObj: any): string {
    debug(`in configDefaultsWithMetaYAMLString()`)

    overrideObj = overrideObj || {}
    const jsonConfig = this.config
    const defaultOverridedConfig: any = {}

    debug(`before props loop`)
    const props = Object.keys(jsonConfig)
    for (let i = 0; i !== props.length; i++) {
      if (jsonConfig.hasOwnProperty(props[i]) && this.configSchemaObject[props[i]]) {
        defaultOverridedConfig[props[i]] = overrideObj[props[i]] || this.configSchema.default(props[i])
      }
    }
    // debug(`defaultOverridedConfig=${JSON.stringify(defaultOverridedConfig)}`)
    debug(`before YAML.Document()`)

    const result = new YAML.Document()
    result.version = 'core'
    result.commentBefore = "Project's configuration options.\nModify as needed and `build` the project after to apply modifications."
    result.contents = (YAML.createNode(defaultOverridedConfig) as unknown) as YAML.ast.Seq

    debug(`before comments adding loop`)

    for (const n of result.contents.items) {
      const node = (n as unknown) as YAML.ast.Pair
      const prop = (node && node.key) || ''
      node.commentBefore = this.configSchemaObject[prop.toString()].doc
    }

    debug(`result = ${result}`)

    return String(result)
  }

  public stringifyPerStyle(obj: object): string {
    return this.configStyle === 'JSON5' ? JSON.stringify(obj, null, 4) : this.configStyle === 'YAML' ? yaml.safeDump(obj) : ''
  }
  public parsePerStyle(str: string): any {
    return this.configStyle === 'JSON5' ? jsonComment.parse(str, undefined, true) : this.configStyle === 'YAML' ? yaml.safeLoad(str) : {}
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

  public chapterWildcardWithNumber(id: ChapterId): string {
    return this.wildcardWithNumber(this.config.chapterPattern, id)
  }
  public metadataWildcardWithNumber(id: ChapterId): string {
    debug(`this.config.metadataPattern=${this.config.metadataPattern}`)
    return this.wildcardWithNumber(this.config.metadataPattern, id)
  }
  public summaryWildcardWithNumber(id: ChapterId): string {
    return this.wildcardWithNumber(this.config.summaryPattern, id)
  }

  public chapterFileNameFromParameters(id: ChapterId, name: string): string {
    return this.filenameFromParameters(this.config.chapterPattern, id, name)
  }

  public metadataFileNameFromParameters(id: ChapterId, name: string): string {
    return this.filenameFromParameters(this.config.metadataPattern, id, name)
  }

  public summaryFileNameFromParameters(id: ChapterId, name: string): string {
    return this.filenameFromParameters(this.config.summaryPattern, id, name)
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
    return re.test(filename) || filename === '@end'
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

  public mapFileToBeRelativeToRootPath(file: string): string {
    return path.relative(this.rootPath, file)
  }
  public mapFilesToBeRelativeToRootPath(files: string[]): string[] {
    return files.map<string>(filename => {
      return this.mapFileToBeRelativeToRootPath(filename)
    })
  }

  public extractNumber(filename: string): number {
    const re = new RegExp(this.numbersPattern(false))
    const match = re.exec(this.mapFileToBeRelativeToRootPath(filename))
    const fileNumber = match ? parseInt(match[1], 10) : -1

    if (isNaN(fileNumber)) {
      return -1
    }
    return fileNumber
  }

  public async getMetadataFilenameFromDirectorySearchFromParameters(id: ChapterId): Promise<string> {
    const files = await this.fsUtils.listFiles(path.join(this.rootPath, this.metadataWildcardWithNumber(id)))
    debug(`Getting metadata filename from search: files=${files}`)
    return files.length > 0 ? files[0] : ''
  }

  public async getAllFilesForPattern(pattern: string): Promise<string[]> {
    const wildcards = [this.wildcardize(pattern, false), this.wildcardize(pattern, true)]
    return this.fsUtils.getAllFilesForWildcards(wildcards, this.rootPath)
  }

  public async getAllMetadataFiles(): Promise<string[]> {
    const wildcards = [this.metadataWildcard(true), this.metadataWildcard(false)]
    return this.fsUtils.getAllFilesForWildcards(wildcards, this.rootPath)
  }

  //TODO: make aware of which filetype it is and use real patterns for cases where the number is repeated
  public renumberedFilename(filename: string, newFilenumber: number, digits: number, atNumbering: boolean): string {
    //Identify if it's a chapter, summary or metadata
    const isChapter = this.chapterRegex(true).test(filename) || this.chapterRegex(false).test(filename)
    const isSummary = this.summaryRegex(true).test(filename) || this.summaryRegex(false).test(filename)
    const isMetadata = this.metadataRegex(true).test(filename) || this.metadataRegex(false).test(filename)
    const originIsAtNumber = this.isAtNumbering(filename)

    debug(`filename: ${filename}\nregex: ${this.chapterRegex(atNumbering)}\nisChapter: ${isChapter}`)
    const total = (isChapter ? 1 : 0) + (isSummary ? 1 : 0) + (isMetadata ? 1 : 0)
    if (total !== 1) {
      throw new ChptrError(
        'Filename does not match Chapter, Summary or Metadata pattern and cannot be renamed.',
        'soft-config:renumberedfilename',
        310
      )
    }

    const chapterId = new ChapterId(newFilenumber, atNumbering, digits)

    //TODO: take care of NAME in other file types too? Or just use the pattern for other files for everything?
    if (isChapter) {
      const matches = this.chapterRegex(originIsAtNumber).exec(filename)
      const name = matches ? matches[2] : ''
      // debug(`return ${this.chapterFileNameFromParameters(this.fsUtils.stringifyNumber(newFilenumber, digits), name, atNumbering)}`)
      return this.chapterFileNameFromParameters(chapterId, name)
    }

    const re = new RegExp(/^(.*?)(@?\d+)(.*)$/)
    return filename.replace(re, `$1${chapterId.toString()}$3`)
  }

  public async getTitleOfChapterFromOldChapterFilename(pattern: string, id: ChapterId): Promise<string> {
    const chapterFilePathWildcard = await this.wildcardWithNumber(pattern, id)
    const files = (await this.fsUtils.getAllFilesForWildcards([chapterFilePathWildcard], this.rootPath)) || ['']

    const re = this.patternRegexer(pattern, id.isAtNumber)
    const chapterMatch = re.exec(this.mapFileToBeRelativeToRootPath(files[0]))
    return chapterMatch ? chapterMatch[2] : ''
  }

  public getFinalPropFor(prop: string): string {
    return this.config.propEquivalents.reduce((pv, cv) => {
      if (cv.arr.map(v=>v.toLowerCase()).indexOf(prop.toLowerCase()) >= 0) {
        return cv.final
      } else {
        return pv
      }
    }, prop)
  }

  private wildcardWithNumber(pattern: string, id: ChapterId): string {
    return pattern.replace(/NUM/g, this.numberWildcardPortion(id.isAtNumber, id.num)).replace(/NAME/g, '*')
  }

  private filenameFromParameters(pattern: string, id: ChapterId, name: string): string {
    return pattern.replace(/NUM/g, (id.isAtNumber ? '@' : '') + id.stringifyNumber()).replace(/NAME/g, this.fsUtils.sanitizeFileName(name))
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

export interface WordCountObject {
  [index: string]: number | moment.Moment
  date: moment.Moment
  wordCountChapterTotal: number
  wordCountSummaryTotal: number
  wordCountChapterDiff: number
  wordCountSummaryDiff: number
}

interface WordCountDTO {
  date: string
  wordCountChapterTotal: number
  wordCountSummaryTotal: number
  wordCountChapterDiff: number
  wordCountSummaryDiff: number
}

interface PropEquivalent {
  arr: string[]
  final: string
}
