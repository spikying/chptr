import { CLIError } from '@oclif/errors'
import { errorColor } from './colorize'

const debug = require('debug')('ChptrError')
export class ChptrError extends CLIError {
  constructor(error: Error | string, code: string, exit: number) {
    super(error, { code, exit })
    debug(
      `${this.bang} ${errorColor('CHPTR ERROR')}\n  message:  ${this.message}\n  number:   ${exit}\n  code:     ${
        this.code
      }\n  stack:    ${this.stack}`
    )
  }

  public toString(): string {
    return errorColor(this.message)
  }
}
