import { CLIError } from '@oclif/errors'

const debug = require('debug')('ChptrError')
export class ChptrError extends CLIError {
  constructor(error: Error | string, code: string, exit: number) {
    super(error, { code, exit })
    debug(
      `${this.bang} ${'CHPTR ERROR'.errorColor()}\n  message:  ${this.message}\n  number:   ${exit}\n  code:     ${
        this.code
      }\n  stack:    ${this.stack}`
    )
  }

  public toString(): string {
    return this.message.errorColor()
  }
}
