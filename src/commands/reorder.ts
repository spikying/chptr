import { Args, Flags } from '@oclif/core'
import { Container } from 'typescript-ioc'
import { compact } from '../flags/compact-flag'
import { CoreUtils } from '../shared/core-utils'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'
// import Command from './compactable-base'

const debug = d('reorder')

export default class Reorder extends BaseCommand<typeof Reorder> {
  static aliases = ['move']

  static args = {
    destinationId: Args.string({
      description: 'Number it will become (write `end` or `@end`to put at the end of each stack).',
      name: 'destinationId',
      required: false
    }),
    originId: Args.string({ description: 'Chapter number to move', name: 'originId', required: false })
  }

  static description = 'Takes a chapter and modifies its index number to fit another ordering place'

  static flags = {
    compact: compact,
    // compact: Flags.boolean({
    //   char: 'c',
    //   default: false,
    //   description: 'Compact chapter numbers at the same time'
    // }),
    save: Flags.boolean({
      char: 's',
      default: false,
      description: 'Commit to git at the same time.'
    })
  }

  static hidden = false

  async run() {
    debug('Running command Reorder')

    const coreUtils = Container.get(CoreUtils)

    // const { args, flags } = await this.parse(Reorder)

    const { compact } = this.flags

    const queryBuilder = new QueryBuilder()
    if (!this.args.originId) {
      queryBuilder.add('originId', queryBuilder.textinput('What chapter to use as origin?', ''))
    }

    if (!this.args.destinationId) {
      queryBuilder.add('destinationId', queryBuilder.textinput('What chapter to use as destination?'))
    }

    const queryResponses: any = await queryBuilder.responses()
    const originId = this.args.originId || queryResponses.originId
    const destinationId = this.args.destinationId || queryResponses.destinationId

    await coreUtils.reorder(originId, destinationId)

    const didAddDigits = await coreUtils.addDigitsToNecessaryStacks()

    let commitMessage = `Reordered files from ${originId} to ${destinationId}`
    if (compact) {
      commitMessage += '\nCompacted file numbers'
      await coreUtils.compactFileNumbers()
    }

    if (didAddDigits) {
      commitMessage += '\nAdded digits to chapter numbers'
    }

    if (this.flags.save) {
      await coreUtils.preProcessAndCommitFiles(commitMessage)
    }
  }
}
