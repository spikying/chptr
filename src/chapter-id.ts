import * as d from 'debug'

const debug = d('chapter-id')
export class ChapterId {
  public num: number
  public isAtNumber: boolean
  public fixedDigits: number

  constructor(num: number, isAtNumber: boolean, fixedDigits?: number) {
    this.num = num
    this.isAtNumber = isAtNumber
    this.fixedDigits = fixedDigits || this.numDigits()
  }

  public numDigits(buffer = 2): number {
    return Math.max(Math.floor(Math.log10(Math.abs(this.num + buffer))), 0) + 1
  }

  public stringifyNumber(digits?: number): string {
    digits = digits || this.fixedDigits

    const s = this.num.toString()
    const zeroes = Math.max(digits - s.length, 0)
    if (zeroes > 0) {
      return '0'.repeat(zeroes).concat(s)
    } else {
      return s
    }
  }

  public equals(obj: ChapterId): boolean {
    debug(`comparing chapter id ${this.toString()} with ${obj.toString()}`)
    return this.num === obj.num && this.isAtNumber === obj.isAtNumber
  }

  public toString(): string {
    return `${this.isAtNumber ? '@' : ''}${this.stringifyNumber()}`
  }
}
