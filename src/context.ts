import * as d from 'debug'
import * as path from "path";

import { globPromise } from './commands/base';
import { Config } from './config';
import { numDigits, stringifyNumber } from './helpers';

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
  maxNecessaryDigits: 1
}

export class Context {
  private readonly configInstance: Config;

  private _allNovelFiles: string[] | null = null

  private readonly _allNovelStatistics: NovelStatistics = { atNumberStack: nullStackStats, normalStack: nullStackStats }

  constructor(configInstance: Config) {
    // this.dirname = dirname
    this.configInstance = configInstance

  }

  public mapFileToBeRelativeToRootPath(file: string): string {
    return path.relative(this.configInstance.projectRootPath, file)
  }
  public mapFilesToBeRelativeToRootPath(files: string[]): string[] {
    return files.map<string>((filename) => {
      return this.mapFileToBeRelativeToRootPath(filename)
    });
  }

  public async getAllNovelFiles(refresh = false): Promise<string[]> {
    if (this._allNovelFiles === null || refresh) {
      const files: string[] = []
      const wildcards = [
        this.configInstance.chapterWildcard(true),
        this.configInstance.metadataWildcard(true),
        this.configInstance.summaryWildcard(true),
        this.configInstance.chapterWildcard(false),
        this.configInstance.metadataWildcard(false),
        this.configInstance.summaryWildcard(false)
      ]
      for (const wildcard of wildcards) {
        debug(`glob pattern = ${path.join(this.configInstance.projectRootPath, wildcard)}`)
        files.push(...await globPromise(path.join(this.configInstance.projectRootPath, wildcard)))
      }
      this._allNovelFiles = files

      this.updateStackStatistics(true)
      this.updateStackStatistics(false)
    }

    return this._allNovelFiles
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

  public renumberedFilename(filename: string, newFilenumber: number, digits: number, atNumbering: boolean): string {
    debug(`filename=${filename} newFileNumber=${newFilenumber} digits=${digits} @numbering = ${atNumbering}`)
    const re = new RegExp(/^(.*?)(@?\d+)(.*)$/)
    return filename.replace(re, '$1' + (atNumbering ? '@' : '') + stringifyNumber(newFilenumber, digits) + '$3')
  }

  public extractNumber(filename: string): number {
    const re = new RegExp(this.configInstance.numbersPattern(false))
    const match = re.exec(path.basename(filename))
    const fileNumber = match ? parseInt(match[1], 10) : -1

    debug(`filename = ${filename} filenumber = ${fileNumber}`)
    if (isNaN(fileNumber)) {
      return -1
    }
    return fileNumber
  }

  private updateStackStatistics(atNumbers: boolean): void {
    const files = this._allNovelFiles || []
    const fileRegex: RegExp = this.configInstance.chapterRegex(atNumbers)
    const index = atNumbers ? 'atNumberStack' : 'normalStack'

    debug(`files: length=${files.length} full=${JSON.stringify(files)}`)
    if (files.length === 0) {
      this._allNovelStatistics[index] = nullStackStats
    }

    debug(`files searched: ${JSON.stringify(files)}`)
    debug(`Regex used: ${fileRegex}`)

    const highestNumber = files.map(value => {
      // debug(`Regex exec: ${JSON.stringify(fileRegex.exec(path.basename(value)))}`)
      const matches = fileRegex.exec(path.basename(value))
      return matches ? parseInt(matches[1], 10) : 0
    }).reduce((previous, current) => {
      return Math.max(previous, current)
    })

    const maxDigits = files
      .map(value => {
        const matches = fileRegex.exec(path.basename(value))
        return matches ? matches[1].length : 0
      })
      .reduce((previous, current) => {
        return Math.max(previous, current)
      })

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

    debug(`highest number = ${highestNumber}`)
    debug(`digits = ${maxDigits}`)

    this._allNovelStatistics[index] = {
      highestNumber,
      minDigits,
      maxNecessaryDigits
    }
  }


}
