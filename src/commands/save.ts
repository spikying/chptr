import { flags } from '@oclif/command'

// import { cli } from 'cli-ux'
import { QueryBuilder } from '../queries'

import { d } from './base'
import Command from './edit-save-base'

const debug = d('command:save')

export default class Save extends Command {
  static description =
    'Parse modified text files, adjust sentence and paragraph endings, commit files to repository (remove deleted ones) and readjust endings.'

  static flags = {
    ...Command.flags,
    filter: flags.string({
      char: 'f',
      required: false,
      default: '',
      // parse: filterNumbers,
      description: 'Chapter number to filter which files to stage before saving to repository',
    })
  }

  static args = [
    {
      name: 'message',
      description: 'Message to use in commit to repository',
      required: false,
      default: '',
    },
  ]

  static aliases = ['commit']

  static hidden = false

  async run() {
    debug('Running Save command')
    const { args, flags } = this.parse(Save)

    const atFilter = flags.filter ? flags.filter.substring(0, 1) === '@' : false
    const numberFilter = flags.filter ? this.context.extractNumber(flags.filter) : undefined

    const toStageFiles = await this.GetGitListOfStageableFiles(numberFilter, atFilter)

    if (toStageFiles.length === 0) {
        this.warn('No files to save to repository')
    } else {
      const queryBuilder = new QueryBuilder()
      if (!args.message) {
        queryBuilder.add('message', queryBuilder.textinput('Message to use in commit to repository?', ''))
      }

      const queryResponses: any = await queryBuilder.responses()

      

      let message: string = args.message || queryResponses.message || 'Modified files:'
      message += '\n' + `${JSON.stringify(toStageFiles)}`
      // debug(`message: ${message}`)

      await this.CommitToGit(message, toStageFiles)
    }
  }
}
