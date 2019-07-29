import { flags } from '@oclif/command'

import { d } from './base'
import Command from './initialized-base'

const debug = d('compactable-base')
export default abstract class extends Command {
  static flags = {
    ...Command.flags,
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false
    })
  }

  public async finally() {
    debug('Running Finally on compactable-base')
    const { flags } = this.parse(this.constructor as any)
    const compact = flags.compact

    if (compact) {
      await this.coreUtils.compactFileNumbers()
      await this.coreUtils.preProcessAndCommitFiles('Compacted file numbers')
    }

    await super.finally()
  }

}
