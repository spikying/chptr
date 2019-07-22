import * as d from 'debug'
import * as path from 'path'

import { numDigits, stringifyNumber } from './commands/base'
import { FsUtils } from './fs-utils'
import { SoftConfig } from './soft-config'

const debug = d('config:context')

interface NovelStatistics {
  atNumberStack: StackStatistics
  normalStack: StackStatistics
}
interface StackStatistics {
  highestNumber: number
  minDigits: number
  maxNecessaryDigits: number
}
const nullStackStats: StackStatistics = {
  highestNumber: 0,
  minDigits: 1,
  maxNecessaryDigits: 1
}

//TODO: move functions where they belong: base.ts, initialized-base.ts, softConfig?
export class Context {
  private readonly configInstance: SoftConfig
  private readonly fsUtils: FsUtils

  // private _allNovelFiles: string[] | null = null
  private _allNormalFiles: string[] | null = null
  private _allAtNumberedFiles: string[] | null = null

  private readonly _allNovelStatistics: NovelStatistics = { atNumberStack: nullStackStats, normalStack: nullStackStats }

  constructor(configInstance: SoftConfig) {
    debug(`New Context instance`)
    this.configInstance = configInstance
    this.fsUtils = new FsUtils()
  }

  public mapFileToBeRelativeToRootPath(file: string): string {
    return path.relative(this.configInstance.projectRootPath, file)
  }
  public mapFilesToBeRelativeToRootPath(files: string[]): string[] {
    return files.map<string>(filename => {
      return this.mapFileToBeRelativeToRootPath(filename)
    })
  }

  // TODO: send back to soft-config?
  // TODO: refactor to feed same private function different wildcard arrays
  public async getAllFilesForChapter(num: number, isAtNumbered: boolean): Promise<string[]> {
    // const files: string[] = []
    const wildcards = [
      this.configInstance.chapterWildcardWithNumber(num, isAtNumbered),
      this.configInstance.metadataWildcardWithNumber(num, isAtNumbered),
      this.configInstance.summaryWildcardWithNumber(num, isAtNumbered)
    ]
    return this.getAllFilesForWildcards(wildcards)
    // for (const wildcard of wildcards) {
    //   files.push(...(await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, wildcard))))
    // }
    // return files
  }

  public async getAllFilesForPattern(pattern: string): Promise<string[]> {
    const wildcards = [this.configInstance.wildcardize(pattern, false), this.configInstance.wildcardize(pattern, true)]
    return this.getAllFilesForWildcards(wildcards)
  }

  public async getAllMetadataFiles(): Promise<string[]> {
    // const files: string[] = []
    const wildcards = [this.configInstance.metadataWildcard(true), this.configInstance.metadataWildcard(false)]
    // for (const wildcard of wildcards) {
    //   files.push(...(await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, wildcard))))
    // }
    // return files
    return this.getAllFilesForWildcards(wildcards)
  }

  public async getAllFilesForOneType(isAtNumbered: boolean, refresh = false): Promise<string[]> {
    const existingFiles = isAtNumbered ? this._allAtNumberedFiles : this._allNormalFiles

    if (existingFiles === null || refresh) {
      // const files: string[] = []
      const wildcards = [
        this.configInstance.chapterWildcard(isAtNumbered),
        this.configInstance.metadataWildcard(isAtNumbered),
        this.configInstance.summaryWildcard(isAtNumbered)
      ]
      const files = await this.getAllFilesForWildcards(wildcards)

      // for (const wildcard of wildcards) {
      //   files.push(...(await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, wildcard))))
      // }

      if (isAtNumbered) {
        this._allAtNumberedFiles = files
      } else {
        this._allNormalFiles = files
      }

      await this.updateStackStatistics(isAtNumbered)
    }

    return (isAtNumbered ? this._allAtNumberedFiles : this._allNormalFiles) as string[]
  }

  public async getAllNovelFiles(refresh = false): Promise<string[]> {
    return (await this.getAllFilesForOneType(true, refresh)).concat(await this.getAllFilesForOneType(false, refresh))
  }

  public getHighestNumber(atNumberStack: boolean): number {
    if (atNumberStack) {
      return this._allNovelStatistics.atNumberStack.highestNumber
    } else {
      return this._allNovelStatistics.normalStack.highestNumber
    }
  }

  public getMaxNecessaryDigits(atNumberStack: boolean): number {
    if (atNumberStack) {
      return this._allNovelStatistics.atNumberStack.maxNecessaryDigits
    } else {
      return this._allNovelStatistics.normalStack.maxNecessaryDigits
    }
  }

  public getMinDigits(atNumberStack: boolean): number {
    if (atNumberStack) {
      return this._allNovelStatistics.atNumberStack.minDigits
    } else {
      return this._allNovelStatistics.normalStack.minDigits
    }
  }

  public getActualDigitsFromChapterFilename(filename: string, atNumber: boolean): number {
    const match = this.configInstance.chapterRegex(atNumber).exec(this.mapFileToBeRelativeToRootPath(filename))
    return match ? match[1].length : 1
  }

  public getNextFilenumber(previousNumber: number): number {
    if (!previousNumber) {
      return this.configInstance.config.numberingInitial
    } else {
      return previousNumber + this.configInstance.config.numberingStep
    }
  }

  //TODO: make aware of which filetype it is and use real patterns for cases where the number is repeated
  public renumberedFilename(filename: string, newFilenumber: number, digits: number, atNumbering: boolean): string {
    //Identify if it's a chapter, summary or metadata
    const isChapter = this.configInstance.chapterRegex(true).test(filename) || this.configInstance.chapterRegex(false).test(filename)
    const isSummary = this.configInstance.summaryRegex(true).test(filename) || this.configInstance.summaryRegex(false).test(filename)
    const isMetadata = this.configInstance.metadataRegex(true).test(filename) || this.configInstance.metadataRegex(false).test(filename)

    debug(`filename: ${filename}\nregex: ${this.configInstance.chapterRegex(atNumbering)}\nisChapter: ${isChapter}`)
    const total = (isChapter ? 1 : 0) + (isSummary ? 1 : 0) + (isMetadata ? 1 : 0)
    if (total !== 1) {
      throw new Error('Filename does not match Chapter, Summary or Metadata pattern and cannot be renamed.')
    }
    //
    if (isChapter) {
      const matches = this.configInstance.chapterRegex(atNumbering).exec(filename)
      const name = matches ? matches[2] : ''
      debug(`return ${this.configInstance.chapterFileNameFromParameters(stringifyNumber(newFilenumber, digits), name, atNumbering)}`)
      return this.configInstance.chapterFileNameFromParameters(stringifyNumber(newFilenumber, digits), name, atNumbering)
    }

    const re = new RegExp(/^(.*?)(@?\d+)(.*)$/)
    return filename.replace(re, '$1' + (atNumbering ? '@' : '') + stringifyNumber(newFilenumber, digits) + '$3')
  }

  public extractNumber(filename: string): number {
    const re = new RegExp(this.configInstance.numbersPattern(false))
    const match = re.exec(this.mapFileToBeRelativeToRootPath(filename))
    const fileNumber = match ? parseInt(match[1], 10) : -1

    if (isNaN(fileNumber)) {
      return -1
    }
    return fileNumber
  }

  public async getMetadataFilenameFromParameters(num: number, atNumbering: boolean): Promise<string> {
    const files = await this.fsUtils.globPromise(
      path.join(this.configInstance.projectRootPath, this.configInstance.metadataWildcardWithNumber(num, atNumbering))
    )
    return files[0]
  }

  public async updateStackStatistics(atNumbers: boolean): Promise<void> {
    const files = await this.getAllNovelFiles()
    const fileRegex: RegExp = this.configInstance.chapterRegex(atNumbers)
    const index = atNumbers ? 'atNumberStack' : 'normalStack'

    debug(`files: ${files}\nfileRegex: ${fileRegex}\nindex: ${index}`)
    if (files.length === 0) {
      this._allNovelStatistics[index] = nullStackStats
      return
    }

    const highestNumber = files
      .map(value => {
        const matches = fileRegex.exec(this.mapFileToBeRelativeToRootPath(value))
        return matches ? parseInt(matches[1], 10) : 0
      })
      .reduce((previous, current) => {
        return Math.max(previous, current)
      }, 0)

    const minDigits = files
      .map(value => {
        const matches = fileRegex.exec(this.mapFileToBeRelativeToRootPath(value))
        return matches ? matches[1].length : 0
      })
      .reduce((previous, current) => {
        return Math.min(previous, current)
      }, 1)

    const maxNecessaryDigits = files
      .map(value => {
        const matches = fileRegex.exec(this.mapFileToBeRelativeToRootPath(value))
        return matches ? numDigits(parseInt(matches[1], 10)) : 0
      })
      .reduce((previous, current) => {
        return Math.max(previous, current)
      }, 1)

    this._allNovelStatistics[index] = {
      highestNumber,
      minDigits,
      maxNecessaryDigits
    }
  }

  private async getAllFilesForWildcards(wildcards: string[]): Promise<string[]> {
    const files: string[] = []
    for (const wildcard of wildcards) {
      files.push(...(await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, wildcard))))
    }
    return files
  }
}
