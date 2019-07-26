import { flags } from '@oclif/command'

import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('command:reorder')

export default class Reorder extends Command {
  static description = 'Takes a chapter and modifies its index number to fit another ordering place'

  static flags = {
    ...Command.flags,
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false
    })
  }

  static args = [
    { name: 'origin', description: 'Chapter number to move', required: false },
    {
      name: 'destination',
      description: 'Number it will become (write `end` or `@end`to put at the end of each stack).',
      required: false
    }
  ]

  static aliases = ['move']
  static hidden = false

  async run() {
    debug('Running command Reorder')
    const { args, flags } = this.parse(Reorder)

    const compact = flags.compact

    const queryBuilder = new QueryBuilder()
    if (!args.origin) {
      queryBuilder.add('origin', queryBuilder.textinput('What chapter to use as origin?', ''))
    }
    if (!args.destination) {
      queryBuilder.add('destination', queryBuilder.textinput('What chapter to use as destination?'))
    }
    const queryResponses: any = await queryBuilder.responses()
    const origin = args.origin || queryResponses.origin
    const destination = args.destination || queryResponses.destination

    await this.reorder(origin, destination)

    const didAddDigits = await this.addDigitsToNecessaryStacks()

    let commitMessage = `Reordered files from ${origin} to ${destination}`
    if (compact) {
      commitMessage += '\nCompacted file numbers'
      await this.compactFileNumbers()
    }
    if (didAddDigits) {
      commitMessage += '\nAdded digits to chapter numbers'
    }

    await this.CommitToGit(commitMessage)
  }
}
