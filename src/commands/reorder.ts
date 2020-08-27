import { flags } from '@oclif/command'

import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './compactable-base'

const debug = d('reorder')

export default class Reorder extends Command {
  static description = 'Takes a chapter and modifies its index number to fit another ordering place'

  static flags = {
    ...Command.flags,
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false
    }),
    save: flags.boolean({
      char: 's',
      description: 'Commit to git at the same time.',
      default: false
    })
  }

  static args = [
    { name: 'originId', description: 'Chapter number to move', required: false },
    {
      name: 'destinationId',
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
    if (!args.originId) {
      queryBuilder.add('originId', queryBuilder.textinput('What chapter to use as origin?', ''))
    }
    if (!args.destinationId) {
      queryBuilder.add('destinationId', queryBuilder.textinput('What chapter to use as destination?'))
    }
    const queryResponses: any = await queryBuilder.responses()
    const originId = args.originId || queryResponses.originId
    const destinationId = args.destinationId || queryResponses.destinationId

    await this.coreUtils.reorder(originId, destinationId)

    const didAddDigits = await this.coreUtils.addDigitsToNecessaryStacks()

    let commitMessage = `Reordered files from ${originId} to ${destinationId}`
    if (compact) {
      commitMessage += '\nCompacted file numbers'
      await this.coreUtils.compactFileNumbers()
    }
    if (didAddDigits) {
      commitMessage += '\nAdded digits to chapter numbers'
    }

    if (flags.save) {
      await this.coreUtils.preProcessAndCommitFiles(commitMessage)
    }
  }
}
