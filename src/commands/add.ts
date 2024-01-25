import { Args } from '@oclif/core'
import { Container } from 'typescript-ioc'
import { compact } from '../flags/compact-flag'
import { CoreUtils } from '../shared/core-utils'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'

const debug = d('add')

export default class Add extends BaseCommand<typeof Add> {
  static args = {
    name: Args.string({
      default: '',
      description: 'name of chapter to add',
      name: 'name',
      required: false
    }),
    number: Args.string({
      default: 'end',
      description:
        'force this number to be used, if available.  AtNumbering will be determined by the presence or absence of @ sign.  Defaults to `end`.',
      required: false
    })
  }

  static description = 'Adds a file or set of files as a new chapter, locally and in repository'

  static flags = {
    compact: compact
    // atnumbered: flags.boolean({
    //   char: 'a',
    //   description: 'Add an @numbered chapter',
    //   default: false
    // })
  }

  static hidden = false

  async run() {
    debug(`Running Add command`)
    // const { args, flags } = await this.parse(Add)

    const coreUtils = Container.get(CoreUtils)

    const queryBuilder = new QueryBuilder()
    if (!this.args.name) {
      queryBuilder.add('name', queryBuilder.textinput('What name do you want as a chapter name?', 'chapter'))
    }

    const queryResponses: any = await queryBuilder.responses()

    const name: string = this.args.name || queryResponses.name

    const futureId = await coreUtils.checkArgPromptAndExtractChapterId(this.args.number, '', true)

    const toStageFiles = await coreUtils.addChapterFiles(
      name,
      futureId ? futureId.isAtNumber : false,
      futureId ? futureId.num.toString() : ''
    )

    const commitMessage = `added\n    ${toStageFiles.join('\n    ')}`

    await coreUtils.addDigitsToNecessaryStacks()
    await coreUtils.preProcessAndCommitFiles(commitMessage, toStageFiles)
  }
}
