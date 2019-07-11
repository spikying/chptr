import { cli } from 'cli-ux'
import * as path from 'path'

import { QueryBuilder } from '../queries'

import { d } from './base'
import Command from './edit-save-base'

const debug = d('command:track')

export default class Track extends Command {
  static description = 'Add a file to be tracked in repository that is not a chapter, summary or metadata file.'

  static flags = {
    ...Command.flags
  }

  static args = [
    {
      name: 'filename',
      description: 'Filename to track',
      required: false,
      default: ''
    }
  ]

  static hidden = false

  async run() {
    debug('Running Track command')
    const { args } = this.parse(Track)

    const queryBuilder = new QueryBuilder()

    if (!args.filename) {
      // TODO : list all eligible files 
      queryBuilder.add('filename', queryBuilder.textinput('What file to track?', ''))
    }


    const queryResponses: any = await queryBuilder.responses()
    const filename = args.filename || queryResponses.filename || ''

    if (!filename)
    {
      this.error('No filename to track'.errorColor())
      this.exit(0)
    }

    cli.action.start('Tracking file'.actionStartColor())

    const toCommitFiles = [this.context.mapFileToBeRelativeToRootPath( filename)]
    
    await this.CommitToGit(`Tracking file ${filename}`, toCommitFiles)

    cli.action.stop('done'.actionStopColor())

  }
}