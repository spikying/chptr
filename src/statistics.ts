import * as d from 'debug'

import { FsUtils } from './fs-utils'
import { SoftConfig } from './soft-config'

const debug = d('config:statistics')

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

export class Statistics {
  private readonly configInstance: SoftConfig
  private readonly fsUtils: FsUtils

  private _allNormalFiles: string[] | null = null
  private _allAtNumberedFiles: string[] | null = null

  private readonly _allNovelStatistics: NovelStatistics = { atNumberStack: nullStackStats, normalStack: nullStackStats }

  constructor(configInstance: SoftConfig) {
    debug(`New Statistics instance`)
    this.configInstance = configInstance
    this.fsUtils = new FsUtils()
  }

  public numDigits(x: number, buffer = 2): number {
    return Math.max(Math.floor(Math.log10(Math.abs(x + buffer))), 0) + 1
  }

  public stringifyNumber(x: number, digits: number): string {
    const s = x.toString()
    const zeroes = Math.max(digits - s.length, 0)
    if (zeroes > 0) {
      return '0'.repeat(zeroes).concat(s)
    } else {
      return s
    }
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
    const match = this.configInstance.chapterRegex(atNumber).exec(this.configInstance.mapFileToBeRelativeToRootPath(filename))
    return match ? match[1].length : 1
  }

  public getNextFilenumber(previousNumber: number): number {
    if (!previousNumber) {
      return this.configInstance.config.numberingInitial
    } else {
      return previousNumber + this.configInstance.config.numberingStep
    }
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
        const matches = fileRegex.exec(this.configInstance.mapFileToBeRelativeToRootPath(value))
        return matches ? parseInt(matches[1], 10) : 0
      })
      .reduce((previous, current) => {
        return Math.max(previous, current)
      }, 0)

    const minDigits = files
      .map(value => {
        const matches = fileRegex.exec(this.configInstance.mapFileToBeRelativeToRootPath(value))
        return matches ? matches[1].length : 0
      })
      .reduce((previous, current) => {
        return Math.min(previous, current)
      }, 1)

    const maxNecessaryDigits = files
      .map(value => {
        const matches = fileRegex.exec(this.configInstance.mapFileToBeRelativeToRootPath(value))
        return matches ? this.numDigits(parseInt(matches[1], 10)) : 0
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

  public async getAllFilesForOneType(isAtNumbered: boolean, refresh = false): Promise<string[]> {
    const existingFiles = isAtNumbered ? this._allAtNumberedFiles : this._allNormalFiles

    if (existingFiles === null || refresh) {
      const wildcards = [
        this.configInstance.chapterWildcard(isAtNumbered),
        this.configInstance.metadataWildcard(isAtNumbered),
        this.configInstance.summaryWildcard(isAtNumbered)
      ]
      const files = await this.fsUtils.getAllFilesForWildcards(wildcards, this.configInstance.projectRootPath)

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
      debug(`return ${this.configInstance.chapterFileNameFromParameters(this.stringifyNumber(newFilenumber, digits), name, atNumbering)}`)
      return this.configInstance.chapterFileNameFromParameters(this.stringifyNumber(newFilenumber, digits), name, atNumbering)
    }

    const re = new RegExp(/^(.*?)(@?\d+)(.*)$/)
    return filename.replace(re, '$1' + (atNumbering ? '@' : '') + this.stringifyNumber(newFilenumber, digits) + '$3')
  }
}
