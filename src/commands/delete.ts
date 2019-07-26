import { flags } from '@oclif/command'
// import { cli } from 'cli-ux'

import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('delete')

export default class Delete extends Command {
  static description = 'Delete a chapter or tracked file locally and in the repository'

  static flags = {
    ...Command.flags,
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false
    })
  }

  static args = [
    {
      name: 'name',
      description: 'chapter number or filename to delete',
      required: false,
      default: ''
    }
  ]

  static aliases = ['del']

  static hidden = false

  async run() {
    debug('Running Delete command')
    const { args, flags } = this.parse(Delete)

    const compact = flags.compact

    const queryBuilder = new QueryBuilder()
    if (!args.name) {
      queryBuilder.add('name', queryBuilder.textinput('Chapter number or filename to delete?'))
    }
    const queryResponses: any = await queryBuilder.responses()
    const nameOrNumber: any = args.name || queryResponses.name

    if (!nameOrNumber) {
      throw new ChptrError('Name or number input empty', 'delete.run', 4)
    }

    await this.deleteFilesFromRepo(nameOrNumber)

    if (compact) {
      await this.compactFileNumbers()
      await this.CommitToGit(`Compacted file numbers`)
    }
  }
}
