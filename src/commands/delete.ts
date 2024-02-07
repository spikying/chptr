import { Args, Flags } from '@oclif/core'
import { Container } from 'typescript-ioc'
import { compact } from '../flags/compact-flag'
import { ChptrError } from '../shared/chptr-error'
import { CoreUtils } from '../shared/core-utils'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'
// import Command from './compactable-base'

const debug = d('delete')

export default class Delete extends BaseCommand<typeof Delete> {
  static aliases = ['del']

  static args = {
    name: Args.string({
      default: '',
      description: 'chapter number or filename to delete',
      name: 'name',
      required: false
    })
  }

  static description = 'Delete a chapter or tracked file locally and in the repository'

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
    debug('Running Delete command')
    // const { args, flags } = await this.parse(Delete)

    const { compact } = this.flags
    const { save } = this.flags

    const coreUtils = Container.get(CoreUtils)

    const queryBuilder = new QueryBuilder()
    if (!this.args.name) {
      queryBuilder.add('name', queryBuilder.textinput('Chapter number or filename to delete?'))
    }

    const queryResponses: any = await queryBuilder.responses()
    const nameOrNumber: any = this.args.name || queryResponses.name

    if (!nameOrNumber) {
      throw new ChptrError('Name or number input empty', 'delete.run', 4)
    }

    let commitMsg = await coreUtils.deleteFilesFromRepo(nameOrNumber)

    if (compact) {
      await coreUtils.compactFileNumbers()
      commitMsg += `\nCompacted file numbers`
    }

    if (save) {
      await coreUtils.preProcessAndCommitFiles(commitMsg, undefined, true)
    }
  }
}
