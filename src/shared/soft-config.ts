// https://codingsans.com/blog/node-config-best-practices

import { ux } from '@oclif/core'
import { glob } from 'glob'
import * as path from 'node:path'
import { Container, Singleton } from 'typescript-ioc'
import { Document, Pair, YAMLSeq } from 'yaml'

import { ChapterId } from './chapter-id'
import { ChptrError } from './chptr-error'
import { FsUtils } from './fs-utils'
import { HardConfig } from './hard-config'

import Convict = require('convict')
import yaml = require('js-yaml')
import JSON5 = require('json5')
import { errorColor } from './colorize'
const moment = require('moment')

Convict.addFormat(require('convict-format-with-validator').email)

const debug = require('debug')('config:soft')

interface ConfigObject {
  buildDirectory: string // | ConfigProperty
  buildFilesAfter: string[]
  buildFilesBefore: string[]
  chapterPattern: string // | ConfigProperty
  definitionFiles: string[]
  filesWithChapterNumbersInContent: string[]
  followupFile: string
  fontName: string // | ConfigProperty
  fontSize: string // | ConfigProperty
  metadataFields: object
  metadataManualFieldsToNumber: string[]
  metadataPattern: string // | ConfigProperty
  numberingInitial: number
  numberingStep: number
  postBuildStep: string
  projectAuthor: Author // | ConfigProperty
  projectLang: string // | ConfigProperty
  projectTitle: string // | ConfigProperty
  propEquivalents: PropEquivalent[]
  summaryPattern: string
  timelineFile: string
}

export interface Author {
  email: string
  name: string
}

@Singleton
export class SoftConfig {
  private _config: ConfigObject | undefined

  private _configStyle = ''

  private _emptyFileString = ''

  private readonly _metadataManualFieldsObj: any

  private _wordCountObject: WordCountObject[] = []

  private readonly configSchemaObject: any = {
    buildDirectory: {
      default: 'build/',
      doc: 'Directory where to output builds done with Pandoc.  Defaults to `build/`.'
    },
    buildFilesAfter: {
      default: [],
      doc: 'File paths to Markdown files to compile after chapters.'
    },
    buildFilesBefore: {
      default: [],
      doc: 'File paths to Markdown files to compile before chapters.'
    },
    chapterPattern: {
      default: 'NUM NAME.chptr',
      doc: 'File naming pattern for chapter files. Use NUM for chapter number and NAME for chapter name.  Optionally use `/` for a folder structure, e.g. `NUM.NAME.md` or `NUM/NAME.chptr`.',
      format(val: string) {
        if (!/^(?=.*NUM)(?=.*NAME).*$/.test(val)) {
          throw new ChptrError('Must have NUM and NAME in pattern', 'soft-config:configschemaobject:chapterpattern', 300)
        }

        const numPos = val.indexOf('NUM')
        const namePos = val.indexOf('NAME')
        if (namePos < numPos) {
          throw new ChptrError('First NUM must be before first NAME in pattern', 'soft-config:configschemaobject:chapterpattern', 301)
        }
      }
    },
    definitionFiles: {
      default: [],
      doc: 'File paths to Markdown files to format with definition markup.'
    },
    filesWithChapterNumbersInContent: {
      default: [],
      doc: 'File paths to files containing chapter numbers, to have them follow in reorder and compact operations.'
    },
    followupFile: {
      default: '',
      doc: 'File path to follow-up file, in Mermaid syntax.'
    },
    fontName: {
      default: '',
      doc: 'Font to use for the rendering engines that use it'
    },
    fontSize: {
      default: '12pt',
      doc: 'Font size for the rendering engines that use it'
    },
    metadataManualFieldsToNumber: {
      default: [],
      doc: 'Array of metadataFields that will be numbered automatically.  Accepts fieldname.* and fieldname[].something as wildcards and array notation.'
    },
    metadataPattern: {
      default: 'NUM.metadata.json',
      doc: 'File naming pattern for metadata files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure. Filename extension .<ext> will be replaced by either `.json5` or `.yaml`.',
      format(val: string) {
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
      }
    },
    numberingInitial: {
      default: 1,
      doc: 'Initial file number'
    },
    numberingStep: {
      default: 1,
      doc: 'Increment step when numbering files'
    },
    postBuildStep: {
      default: '',
      doc: 'Executable or script to run after Build, relative to root.'
    },
    projectAuthor: {
      doc: "Author's name and email for the project.",
      email: {
        default: '---',
        doc: "Author's email for the project.",
        format: 'email'
      },
      name: {
        default: '',
        doc: "Author's name for the project.",
        format(val: string) {
          if (val.length === 0) {
            throw new ChptrError('Must have an author name', 'soft-config:configschemaobject.author', 306)
          }
        }
      }
    },
    projectLang: {
      default: 'en',
      doc: 'Project language'
    },
    projectTitle: {
      default: 'MyNovel',
      doc: 'Title for the project.  Will be used as a head title in renderings.'
    },
    propEquivalents: {
      default: [],
      doc: 'When extracting props metadata, coalesce `arr` values to `final` value.  Each object in array must contain `arr` array of strings and `final` string.'
    },
    summaryPattern: {
      default: 'NUM.summary.md',
      doc: 'File naming pattern for summary files.  Use NUM for chapter number and NAME for optional chapter name.  Optionally use `/` for a folder structure.',
      format(val: string) {
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
      }
    },
    timelineFile: {
      default: '',
      doc: 'File path to timeline file, in Mermaid syntax.'
    }
    // ,
    // metadataFields: {
    //   doc: 'All fields to be added in each Metadata file.  JSON.stringified string.',
    //   format: String,
    //   default: JSON.stringify(JSON.stringify(this.metadataCustomFieldsObject))
    // }
  }

  private readonly configSchema = Convict(this.configSchemaObject)

  private readonly fsUtils: FsUtils

  private readonly hardConfig: HardConfig

  private readonly rootPath: string

  constructor(readFromFile = true) {
    debug('CONSTRUCTOR SOFT-CONFIG')
    this.hardConfig = Container.get(HardConfig)
    this.rootPath = Container.getValue('rootPath')
    this.fsUtils = Container.get(FsUtils)

    debug('here 1')

    if (readFromFile) {
      let configFileString = ''
      let metadataFieldsString = ''
      let objConfig = {}

      try {
        if (this.configStyle === 'JSON5') {
          configFileString = this.fsUtils.loadFileSync(this.hardConfig.configJSON5FilePath)
          metadataFieldsString = this.fsUtils.loadFileSync(this.hardConfig.metadataFieldsJSON5FilePath)

          objConfig = JSON5.parse(configFileString) // parse(configFileString, undefined, true)
          this._metadataManualFieldsObj = JSON5.parse(metadataFieldsString)
        } else if (this.configStyle === 'YAML') {
          configFileString = this.fsUtils.loadFileSync(this.hardConfig.configYAMLFilePath)
          metadataFieldsString = this.fsUtils.loadFileSync(this.hardConfig.metadataFieldsYAMLFilePath)

          // const yamlOptions = { keepBlobsInJSON: false, prettyErrors: true }
          debug(`configFileString:\n${configFileString}`)
          objConfig = yaml.load(configFileString) as any
          debug(`objConfig = ${JSON.stringify(objConfig)}`)
          this._metadataManualFieldsObj = yaml.load(metadataFieldsString)
          debug(`_metadataFieldsObj = ${JSON.stringify(this._metadataManualFieldsObj)}`)
        } else {
          throw new ChptrError('config style must be JSON5 or YAML', 'soft-config:ctor', 308)
        }
      } catch (error: any) {
        debug(errorColor(error.toString()))
        throw new ChptrError(`loading or processing config files error: ${error.toString().infoColor()}`, 'soft-config.ctor', 200)
      }

      try {
        this.configSchema.load(objConfig)
        this.configSchema.validate({ allowed: 'strict' }) // 'strict' throws error if config does not conform to schema
      } catch (error: any) {
        throw new ChptrError(`processing config data error: ${error.toString().infoColor()}`, 'soft-config:ctor', 309)
      }
    }
  }

  public get buildDirectory(): string {
    return path.join(this.rootPath, this.config.buildDirectory)
  }

  public get buildFilesAfter(): string[] {
    const result: string[] = []
    for (const file of this.config.buildFilesAfter) {
      result.push(path.join(this.rootPath, file))
    }

    return result
  }

  public get buildFilesBefore(): string[] {
    const result: string[] = []
    for (const file of this.config.buildFilesBefore) {
      result.push(path.join(this.rootPath, file))
    }

    return result
  }

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
        computed: { title: '###', wordCount: 0 },
        extracted: {},
        manual: this._metadataManualFieldsObj
      }

      this._config = jsonConfig
      // return jsonConfig as ConfigObject
    }

    return this._config as ConfigObject
  }

  // public templateReadmeString = `\n# ${this.config.projectTitle}\n\nA novel by ${this.config.projectAuthor.name}.`

  public get configFilePath(): string {
    return this.configStyle === 'JSON5'
      ? this.hardConfig.configJSON5FilePath
      : this.configStyle === 'YAML'
        ? this.hardConfig.configYAMLFilePath
        : ''
  }

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
        } catch (error) {
          throw new ChptrError(
            `File ${this.hardConfig.configJSON5FilePath} or ${this.hardConfig.configYAMLFilePath} either doesn't exist or is not readable by process.\n${error}`,
            'soft-config:configstyle.get',
            307
          )
        }
      }
    }

    return this._configStyle
  }

  public get definitionFiles(): string[] {
    const result: string[] = []
    for (const file of this.config.definitionFiles) {
      result.push(path.join(this.rootPath, file))
    }

    return result
  }

  public get emptyFileString(): string {
    if (!this._emptyFileString) {
      try {
        const content = this.fsUtils.loadFileSync(this.hardConfig.emptyFilePath)
        this._emptyFileString = content
      } catch (error) {
        ux.warn(`Could not read from an empty file template at ${this.hardConfig.emptyFilePath}.  Serving default empty file template.`)
        debug(error)
        return this.hardConfig.templateEmptyFileString
      }
    }

    return this._emptyFileString
  }

  public get filesWithChapterNumbersInContent(): string[] {
    return this.config.filesWithChapterNumbersInContent.map(f => path.join(this.rootPath, f))
  }

  public get followupFile(): string {
    return path.join(this.rootPath, this.config.followupFile)
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

  public get metadataFieldsDefaults(): any {
    return this._metadataManualFieldsObj
  }

  public get postBuildStep(): string {
    return path.join(this.rootPath, this.config.postBuildStep)
  }

  public get timelineFile(): string {
    return path.join(this.rootPath, this.config.timelineFile)
  }

  public set WordCountData(value: WordCountObject[]) {
    const uniqueValue = []
    const map = new Map()
    for (const item of value) {
      debug(`setting WordCountData, item ${JSON.stringify(item)}`)
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
        wordCountChapterDiff: o.wordCountChapterDiff,
        wordCountChapterTotal: o.wordCountChapterTotal,
        wordCountSummaryDiff: o.wordCountSummaryDiff,
        wordCountSummaryTotal: o.wordCountSummaryTotal
      }
      return v
    })
    debug('before writing wordcount file')
    this.fsUtils.writeFileSync(wordCountFilePath, this.stringifyPerStyle(dto))
    debug('after writing wordcount file')
  }

  public get WordCountData(): WordCountObject[] {
    const wordCountFilePath = path.join(this.buildDirectory, `wordCountData.${this.configStyle.toLowerCase()}`)
    const getFromFile = () => {
      try {
        const wordCountFileExists = this.fsUtils.fileExistsSync(wordCountFilePath)
        if (!wordCountFileExists) {
          throw new Error(`File ${wordCountFilePath} doesn't exist`)
        }

        const wordCountContent = this.fsUtils.loadFileSync(wordCountFilePath)
        const wco: WordCountDTO[] = this.parsePerStyle(wordCountContent)
        this._wordCountObject = wco.map<WordCountObject>(o => {
          const v: WordCountObject = {
            date: moment(o.date),
            wordCountChapterDiff: o.wordCountChapterDiff,
            wordCountChapterTotal: o.wordCountChapterTotal,
            wordCountSummaryDiff: o.wordCountSummaryDiff,
            wordCountSummaryTotal: o.wordCountSummaryTotal
          }
          return v
        })
      } catch {
        ux.log('No existing wordCount file')
      }

      return this._wordCountObject
    }

    return this._wordCountObject.length > 0 ? this._wordCountObject : getFromFile()
  }

  public chapterFileNameFromParameters(id: ChapterId, name: string): string {
    return this.filenameFromParameters(this.config.chapterPattern, id, name)
  }

  public chapterRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.chapterPattern, atNumber)
  }

  public chapterWildcard(atNumbering: boolean): string {
    return this.wildcardize(this.config.chapterPattern, atNumbering)
  }

  public chapterWildcardWithNumber(id: ChapterId): string {
    return this.wildcardWithNumber(this.config.chapterPattern, id)
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
        let val = overrideObj[props[i]] || this.configSchema.default(props[i] as any)
        if (typeof val === 'object') {
          val = JSON.stringify(val)
        } else if (typeof val === 'string' && val.slice(0, 1) === '"') {
          // do nothing
        } else {
          val = `"${val}"`
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
        defaultOverridedConfig[props[i]] = overrideObj[props[i]] || this.configSchema.default(props[i] as any)
      }
    }

    // debug(`defaultOverridedConfig=${JSON.stringify(defaultOverridedConfig)}`)
    debug(`before YAML.Document()`)
    const result = new Document()
    // result.version = 'core'
    result.commentBefore = "Project's configuration options.\nModify as needed and `build` the project after to apply modifications."
    result.contents = result.createNode(defaultOverridedConfig) as unknown as YAMLSeq // YAML.ast.Seq

    debug(`before comments adding loop`)
    for (const n of result.contents.items) {
      const nodeAsPair = n as unknown as Pair // YAML.ast.Pair
      const nodeAsSeq = n as unknown as YAMLSeq
      const prop = (nodeAsPair && nodeAsPair.key) || ''
      nodeAsSeq.commentBefore = this.configSchemaObject[prop.toString()].doc
    }

    debug(`result = ${result}`)

    return String(result)
  }

  public extractNumber(filename: string): number {
    const re = new RegExp(this.numbersPattern(false))
    const match = re.exec(this.mapFileToBeRelativeToRootPath(filename))
    const fileNumber = match ? Number.parseInt(match[1], 10) : -1

    if (isNaN(fileNumber)) {
      return -1
    }

    return fileNumber
  }

  public extractNumberWithLeadingZeroes(filename: string): string {
    const re = new RegExp(this.numbersPattern(false))
    const match = re.exec(this.mapFileToBeRelativeToRootPath(filename))
    return match ? match[1] : ''
  }

  public async getAllChapterFiles(noAtNumber: boolean = false): Promise<string[]> {
    const wildcards = [this.chapterWildcard(false)]
    if (!noAtNumber) {
      wildcards.push(this.chapterWildcard(true))
    }

    return this.fsUtils.getAllFilesForWildcards(wildcards, this.rootPath)
  }

  public async getAllFilesForPattern(pattern: string): Promise<string[]> {
    const wildcards = [this.wildcardize(pattern, false), this.wildcardize(pattern, true)]
    return this.fsUtils.getAllFilesForWildcards(wildcards, this.rootPath)
  }

  public async getAllMetadataFiles(noAtNumber: boolean = false): Promise<string[]> {
    const wildcards = [this.metadataWildcard(false)]
    if (!noAtNumber) {
      wildcards.push(this.metadataWildcard(true))
    }

    return this.fsUtils.getAllFilesForWildcards(wildcards, this.rootPath)
  }

  public getFinalPropFor(prop: string): string {
    return this.config.propEquivalents.reduce((pv, cv) => {
      if (cv.arr.map(v => v.toLowerCase()).includes(prop.toLowerCase())) {
        return cv.final
      }

      return pv
    }, prop)
  }

  public async getMetadataFilenameFromDirectorySearchFromParameters(id: ChapterId): Promise<string> {
    const files = await glob(path.join(this.rootPath, this.metadataWildcardWithNumber(id)))
    debug(`Getting metadata filename from search: files=${files}`)
    return files.length > 0 ? files[0] : ''
  }

  public async getTitleOfChapterFromOldChapterFilename(pattern: string, id: ChapterId): Promise<string> {
    const chapterFilePathWildcard = await this.wildcardWithNumber(pattern, id)
    const files = (await this.fsUtils.getAllFilesForWildcards([chapterFilePathWildcard], this.rootPath)) || ['']

    const re = this.patternRegexer(pattern, id.isAtNumber)
    const chapterMatch = re.exec(this.mapFileToBeRelativeToRootPath(files[0]))
    return chapterMatch ? chapterMatch[2] : ''
  }

  public isAtNumbering(filename: string): boolean {
    const re = new RegExp(this.numbersPattern(true))
    return re.test(filename) || filename === '@end'
  }

  public mapFilesToBeRelativeToRootPath(files: string[]): string[] {
    return files.map<string>(filename => this.mapFileToBeRelativeToRootPath(filename))
  }

  public mapFileToBeRelativeToRootPath(file: string): string {
    return path.relative(this.rootPath, file)
  }

  public metadataFileNameFromParameters(id: ChapterId, name: string): string {
    return this.filenameFromParameters(this.config.metadataPattern, id, name)
  }

  public metadataRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.metadataPattern, atNumber)
  }

  public metadataWildcard(atNumbering: boolean): string {
    return this.wildcardize(this.config.metadataPattern, atNumbering)
  }

  public metadataWildcardWithNumber(id: ChapterId): string {
    // debug(`this.config.metadataPattern=${this.config.metadataPattern}`)
    return this.wildcardWithNumber(this.config.metadataPattern, id)
  }

  public numbersPattern(atNumber: boolean): string {
    return atNumber ? '@(\\d+)' : '(\\d+)'
  }

  public parsePerStyle(str: string): any {
    return this.configStyle === 'JSON5' ? JSON5.parse(str) : this.configStyle === 'YAML' ? yaml.load(str) : {}
  }

  public patternRegexer(pattern: string, atNumber: boolean): RegExp {
    return new RegExp(
      '^' +
        pattern
          .replaceAll(/[/\\]/g, '[\\/\\\\]')
          .replace(/NUM/, this.numbersPattern(atNumber))
          .replace(/NAME/, '(.*)')
          .replaceAll('NUM', '\\1')
          .replaceAll('NAME', '\\2')
    )
  }

  // TODO: make aware of which filetype it is and use real patterns for cases where the number is repeated
  public renumberedFilename(filename: string, newFilenumber: number, digits: number, atNumbering: boolean): string {
    // Identify if it's a chapter, summary or metadata
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

    // TODO: take care of NAME in other file types too? Or just use the pattern for other files for everything?
    if (isChapter) {
      const matches = this.chapterRegex(originIsAtNumber).exec(filename)
      const name = matches ? matches[2] : ''
      // debug(`return ${this.chapterFileNameFromParameters(this.fsUtils.stringifyNumber(newFilenumber, digits), name, atNumbering)}`)
      return this.chapterFileNameFromParameters(chapterId, name)
    }

    const re = new RegExp(/^(.*?)(@?\d+)(.*)$/)
    return filename.replace(re, `$1${chapterId.toString()}$3`)
  }

  public stringifyPerStyle(obj: object): string {
    return this.configStyle === 'JSON5' ? JSON.stringify(obj, null, 4) : this.configStyle === 'YAML' ? yaml.dump(obj) : ''
  }

  public summaryFileNameFromParameters(id: ChapterId, name: string): string {
    return this.filenameFromParameters(this.config.summaryPattern, id, name)
  }

  public summaryRegex(atNumber: boolean): RegExp {
    return this.patternRegexer(this.config.summaryPattern, atNumber)
  }

  public summaryWildcard(atNumbering: boolean): string {
    return this.wildcardize(this.config.summaryPattern, atNumbering)
  }

  public summaryWildcardWithNumber(id: ChapterId): string {
    return this.wildcardWithNumber(this.config.summaryPattern, id)
  }

  public wildcardize(pattern: string, atNumbering: boolean): string {
    return pattern.replaceAll('NUM', this.numberWildcardPortion(atNumbering)).replaceAll('NAME', '*')
  }

  private filenameFromParameters(pattern: string, id: ChapterId, name: string): string {
    return pattern
      .replaceAll('NUM', (id.isAtNumber ? '@' : '') + id.stringifyNumber())
      .replaceAll('NAME', this.fsUtils.sanitizeFileName(name))
  }

  private numberWildcardPortion(atNumbering: boolean, num: null | number = null) {
    let result = ''
    if (atNumbering) {
      result += '@'
    }

    result += num ? '*(0)' + num.toString() : '+(0|1|2|3|4|5|6|7|8|9)'
    return result
  }

  private wildcardWithNumber(pattern: string, id: ChapterId): string {
    return pattern.replaceAll('NUM', this.numberWildcardPortion(id.isAtNumber, id.num)).replaceAll('NAME', '*')
  }
}

export interface WordCountObject {
  [index: string]: moment.Moment | number
  date: moment.Moment
  wordCountChapterDiff: number
  wordCountChapterTotal: number
  wordCountSummaryDiff: number
  wordCountSummaryTotal: number
}

interface WordCountDTO {
  date: string
  wordCountChapterDiff: number
  wordCountChapterTotal: number
  wordCountSummaryDiff: number
  wordCountSummaryTotal: number
}

interface PropEquivalent {
  arr: string[]
  final: string
}
