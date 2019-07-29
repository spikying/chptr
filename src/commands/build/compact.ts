import { d } from '../base'
import Command from '../initialized-base'

const debug = d('build:compact')

 export class Compact extends Command
{
  static description = `Only compacts numbers of files`

  static flags = {
    ...Command.flags
  }

  static hidden = false

  async run() {
    debug('Running Build:compact command')
    await this.coreUtils.compactFileNumbers()
    await this.coreUtils.preProcessAndCommitFiles('Compacted file numbers')

  }
}
