import { CLIError } from '@oclif/errors'
import * as d from 'debug'

const debug = d('errors')
export class ChptrError extends CLIError {
  constructor(error: string | Error, code: string, exit: number) {
    super(error, { code, exit })
    debug(`CHPTR ERROR\n  stack:${this.stack}\n  message:${this.message}\n  name: ${this.name}\n  bang: ${this.bang}\n  ${this.code}`)

  }

  public toString(): string {
    return this.message.errorColor()
  }
}
