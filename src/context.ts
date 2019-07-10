import * as d from 'debug'
import * as fs from 'fs'
import * as path from 'path'

import { globPromise, numDigits, stringifyNumber } from './commands/base'
import { Config } from './config'

const debug = d('context')

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
  maxNecessaryDigits: 1,
}

export class Context {
  private readonly configInstance: Config

  // private _allNovelFiles: string[] | null = null
  private _allNormalFiles: string[] | null = null
  private _allAtNumberedFiles: string[] | null = null

  private readonly _allNovelStatistics: NovelStatistics = { atNumberStack: nullStackStats, normalStack: nullStackStats }

  constructor(configInstance: Config) {
    debug(`New Context instance`)
    this.configInstance = configInstance
  }

  public mapFileToBeRelativeToRootPath(file: string): string {
    return path.relative(this.configInstance.projectRootPath, file)
  }
  public mapFilesToBeRelativeToRootPath(files: string[]): string[] {
    return files.map<string>(filename => {
      return this.mapFileToBeRelativeToRootPath(filename)
    })
  }

  public async getAllFilesForOneType(isAtNumbered: boolean, refresh = false): Promise<string[]> {
    const existingFiles = isAtNumbered ? this._allAtNumberedFiles : this._allNormalFiles

    if (existingFiles === null || refresh) {
      const files: string[] = []
      const wildcards = [
        this.configInstance.chapterWildcard(isAtNumbered),
        this.configInstance.metadataWildcard(isAtNumbered),
        this.configInstance.summaryWildcard(isAtNumbered),
      ]
      for (const wildcard of wildcards) {
        files.push(...(await globPromise(path.join(this.configInstance.projectRootPath, wildcard))))
      }

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

  public getNextFilenumber(previousNumber: number): number {
    if (!previousNumber) {
      return this.configInstance.config.numberingInitial
    } else {
      return previousNumber + this.configInstance.config.numberingStep
    }
  }

  public renumberedFilename(filename: string, newFilenumber: number, digits: number, atNumbering: boolean): string {
    const re = new RegExp(/^(.*?)(@?\d+)(.*)$/)
    return filename.replace(re, '$1' + (atNumbering ? '@' : '') + stringifyNumber(newFilenumber, digits) + '$3')
  }

  public extractNumber(filename: string): number {
    const re = new RegExp(this.configInstance.numbersPattern(false))
    const match = re.exec(path.basename(filename))
    const fileNumber = match ? parseInt(match[1], 10) : -1

    if (isNaN(fileNumber)) {
      return -1
    }
    return fileNumber
  }

  public async getMetadataFilenameFromParameters(num: number, atNumbering: boolean): Promise<string> {
    const files = await globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.metadataWildcardWithNumber(num, atNumbering)))
    return files[0]
  }

  public getBuildDirectory(): string {
    const buildDirectory = path.join(this.configInstance.projectRootPath, this.configInstance.buildDirectory)
    if (!fs.existsSync(buildDirectory)) {
      fs.mkdirSync(buildDirectory)
    }
    return buildDirectory
  }

  public async updateStackStatistics(atNumbers: boolean): Promise<void> {
    const files = await this.getAllNovelFiles()
    const fileRegex: RegExp = this.configInstance.chapterRegex(atNumbers)
    const index = atNumbers ? 'atNumberStack' : 'normalStack'

    if (files.length === 0) {
      this._allNovelStatistics[index] = nullStackStats
      return
    }

    const highestNumber = files
      .map(value => {
        const matches = fileRegex.exec(path.basename(value))
        return matches ? parseInt(matches[1], 10) : 0
      })
      .reduce((previous, current) => {
        return Math.max(previous, current)
      })

    // const maxDigits = files
    //   .map(value => {
    //     const matches = fileRegex.exec(path.basename(value))
    //     return matches ? matches[1].length : 0
    //   })
    //   .reduce((previous, current) => {
    //     return Math.max(previous, current)
    //   })

    const minDigits = files
      .map(value => {
        const matches = fileRegex.exec(path.basename(value))
        return matches ? matches[1].length : 0
      })
      .reduce((previous, current) => {
        return Math.min(previous, current)
      })

    const maxNecessaryDigits = files
      .map(value => {
        const matches = fileRegex.exec(path.basename(value))
        return matches ? numDigits(parseInt(matches[1], 10)) : 0
      })
      .reduce((previous, current) => {
        return Math.max(previous, current)
      })

    this._allNovelStatistics[index] = {
      highestNumber,
      minDigits,
      maxNecessaryDigits,
    }
  }
}
