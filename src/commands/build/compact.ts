import { d } from '../base'
import { flags } from '@oclif/command'
import Command from '../initialized-base'

const debug = d('build:compact')

export class Compact extends Command {
  static description = `Only compacts numbers of files`

  static flags = {
    ...Command.flags,
    save: flags.boolean({
      char: 's',
      description: 'Commit to git at the same time.',
      default: false
    })
  }

  static hidden = false

  async run() {
    debug('Running Build:compact command')
    const { args, flags } = this.parse(Compact)

    await this.coreUtils.preProcessAndCommitFiles('Before compacting file numbers')
    await this.coreUtils.compactFileNumbers()
    if (flags.save) {
      await this.coreUtils.preProcessAndCommitFiles('Compacted file numbers')
    }
  }
}
