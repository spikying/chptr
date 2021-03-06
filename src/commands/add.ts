import { flags } from '@oclif/command'
// import { cli } from 'cli-ux'

// import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './compactable-base'
import { ChapterId } from '../chapter-id'

const debug = d('add')

export default class Add extends Command {
  static description = 'Adds a file or set of files as a new chapter, locally and in repository'

  static flags = {
    ...Command.flags
    // atnumbered: flags.boolean({
    //   char: 'a',
    //   description: 'Add an @numbered chapter',
    //   default: false
    // })
  }

  static args = [
    {
      name: 'number',
      description:
        'force this number to be used, if available.  AtNumbering will be determined by the presence or absence of @ sign.  Defaults to `end`.',
      required: false,
      default: 'end'
    },
    {
      name: 'name',
      description: 'name of chapter to add',
      required: false,
      default: ''
    }
  ]

  static hidden = false

  async run() {
    debug(`Running Add command`)
    const { args, flags } = this.parse(Add)

    const queryBuilder = new QueryBuilder()
    if (!args.name) {
      queryBuilder.add('name', queryBuilder.textinput('What name do you want as a chapter name?', 'chapter'))
    }

    const queryResponses: any = await queryBuilder.responses()

    const name: string = args.name || queryResponses.name

    const futureId = await this.coreUtils.checkArgPromptAndExtractChapterId(args.number, '', true)

    const toStageFiles = await this.coreUtils.addChapterFiles(
      name,
      futureId ? futureId.isAtNumber : false,
      futureId ? futureId.num.toString() : ''
    ) // flags.atnumbered, args.number)

    const commitMessage = `added\n    ${toStageFiles.join('\n    ')}`

    await this.coreUtils.addDigitsToNecessaryStacks()
    await this.coreUtils.preProcessAndCommitFiles(commitMessage, toStageFiles)
  }
}
