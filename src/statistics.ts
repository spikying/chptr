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
  private readonly softConfig: SoftConfig
  private readonly rootPath: string
  private readonly fsUtils: FsUtils

  private _allNormalFiles: string[] | null = null
  private _allAtNumberedFiles: string[] | null = null

  private readonly _allNovelStatistics: NovelStatistics = { atNumberStack: nullStackStats, normalStack: nullStackStats }

  constructor(softConfig: SoftConfig, rootPath: string) {
    debug(`New Statistics instance`)
    this.softConfig = softConfig
    this.rootPath = rootPath
    this.fsUtils = new FsUtils()
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
    const match = this.softConfig.chapterRegex(atNumber).exec(this.softConfig.mapFileToBeRelativeToRootPath(filename))
    return match ? match[1].length : 1
  }

  public getNextFilenumber(previousNumber: number): number {
    if (!previousNumber) {
      return this.softConfig.config.numberingInitial
    } else {
      return previousNumber + this.softConfig.config.numberingStep
    }
  }

  public async updateStackStatistics(atNumbers: boolean, refresh?: boolean): Promise<void> {
    const files = await this.getAllNovelFiles(refresh)
    const fileRegex: RegExp = this.softConfig.chapterRegex(atNumbers)
    const index = atNumbers ? 'atNumberStack' : 'normalStack'

    debug(`files: ${files}\nfileRegex: ${fileRegex}\nindex: ${index}`)
    if (files.length === 0) {
      this._allNovelStatistics[index] = nullStackStats
      return
    }

    const highestNumber = files
      .map(value => {
        const matches = fileRegex.exec(this.softConfig.mapFileToBeRelativeToRootPath(value))
        return matches ? parseInt(matches[1], 10) : 0
      })
      .reduce((previous, current) => {
        return Math.max(previous, current)
      }, 0)

    const minDigits = files
      .map(value => {
        const matches = fileRegex.exec(this.softConfig.mapFileToBeRelativeToRootPath(value))
        return matches ? matches[1].length : 0
      })
      .reduce((previous, current) => {
        return Math.min(previous, current)
      }, 1)

    const maxNecessaryDigits = files
      .map(value => {
        const matches = fileRegex.exec(this.softConfig.mapFileToBeRelativeToRootPath(value))
        return matches ? this.fsUtils.numDigits(parseInt(matches[1], 10)) : 0
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

  public async getAllFilesForChapter(num: number, isAtNumbered: boolean): Promise<string[]> {
    const wildcards = [
      this.softConfig.chapterWildcardWithNumber(num, isAtNumbered),
      this.softConfig.metadataWildcardWithNumber(num, isAtNumbered),
      this.softConfig.summaryWildcardWithNumber(num, isAtNumbered)
    ]
    return this.fsUtils.getAllFilesForWildcards(wildcards, this.rootPath)
  }

  public async getAllFilesForOneType(isAtNumbered: boolean, refresh = false): Promise<string[]> {
    const existingFiles = isAtNumbered ? this._allAtNumberedFiles : this._allNormalFiles

    if (existingFiles === null || refresh) {
      const wildcards = [
        this.softConfig.chapterWildcard(isAtNumbered),
        this.softConfig.metadataWildcard(isAtNumbered),
        this.softConfig.summaryWildcard(isAtNumbered)
      ]
      const files = await this.fsUtils.getAllFilesForWildcards(wildcards, this.rootPath)

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
}
