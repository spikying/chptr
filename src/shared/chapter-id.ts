const debug = require('debug')('chapter-id')

export class ChapterId {
  public fixedDigits: number
  public isAtNumber: boolean
  public num: number

  constructor(num: number, isAtNumber: boolean, fixedDigits?: number) {
    this.num = num
    this.isAtNumber = isAtNumber
    this.fixedDigits = fixedDigits || this.computeNumDigits()
  }

  public computeNumDigits(): number {
    const buffer = 2
    return Math.max(Math.floor(Math.log10(Math.abs(this.num + buffer))), 0) + 1
  }

  public equals(obj: ChapterId): boolean {
    debug(`comparing chapter id ${this.toString()} with ${obj.toString()}`)
    return this.num === obj.num && this.isAtNumber === obj.isAtNumber
  }

  public stringifyNumber(): string {
    const s = this.num.toString()
    const zeroes = Math.max(this.fixedDigits - s.length, 0)
    if (zeroes > 0) {
      return '0'.repeat(zeroes).concat(s)
    }

    return s
  }

  public toString(): string {
    return `${this.isAtNumber ? '@' : ''}${this.stringifyNumber()}`
  }
}
