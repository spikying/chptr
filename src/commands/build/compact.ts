import { Flags } from '@oclif/core'

import BaseCommand, { d } from '../base'
// import Command from '../initialized-base'
import { Container } from 'typescript-ioc'
import { CoreUtils } from '../../shared/core-utils'

const debug: (msg: string) => void = d('build:compact')

export class Compact extends BaseCommand<typeof Compact> {
  static description = `Only compacts numbers of files`

  static flags = {
    save: Flags.boolean({
      char: 's',
      default: false,
      description: 'Commit to git at the same time.'
    })
  }

  static hidden = false

  async run() {
    debug('Running Build:compact command')
    const { flags } = await this.parse(Compact)

    const coreUtils = Container.get(CoreUtils)
    await coreUtils.preProcessAndCommitFiles('Before compacting file numbers')
    await coreUtils.compactFileNumbers()
    if (flags.save) {
      await coreUtils.preProcessAndCommitFiles('Compacted file numbers')
    }
  }
}
