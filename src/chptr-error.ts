import { CLIError } from '@oclif/errors'
import * as d from 'debug'

const debug = d('errors')
export class ChptrError extends CLIError {
  constructor(error: string | Error, code: string, exit: number) {
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
