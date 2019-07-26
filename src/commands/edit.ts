import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('command:edit')

export default class Edit extends Command {
  static description = 'Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.'

  static flags = {
    ...Command.flags,
    type: flags.string({
      char: 't',
      description: 'Edit either chapter file, summary file or all.',
      default: 'all',
      options: ['all', 'summary', 'chapter']
    })
  }

  static args = [
    {
      name: 'chapterIds',
      description: 'Chapter number(s) to modify, comma-separated.',
      required: false,
      default: ''
    }
  ]

  static aliases = ['modify', 'mod']

  // for variable length arguments (https://oclif.io/docs/args)
  static strict = false

  static hidden = false

  async run() {
    debug('Running Edit command')
    const { flags, argv } = this.parse(Edit)

    const editType = flags.type

    const chapterIdsString: string[] = []
    const toEditFiles: string[] = []
    if (!argv[0]) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('chapterIds', queryBuilder.textinput('What chapters to put in edit mode? (comma-separated list)', ''))
      const queryResponses: any = await queryBuilder.responses()
      chapterIdsString.push(...queryResponses.chapterIds.split(','))
    } else {
      //loop through all argv[i] to get all chapter numbers.  If first argument contains commas, it's a single argument to split at ','.
      if (argv[0].split(',').length > 1) {
        chapterIdsString.push(...argv[0].split(','))
      } else {
        chapterIdsString.push(...argv)
      }
    }

    for (const id of chapterIdsString.map(
      (input: string) => new ChapterId(this.softConfig.extractNumber(input), this.softConfig.isAtNumbering(input))
    )) {
      if (editType === 'all' || editType === 'chapter') {
        toEditFiles.push(
          ...(await this.fsUtils.globPromise(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(id))))
        )
      }
      if (editType === 'all' || editType === 'summary') {
        toEditFiles.push(
          ...(await this.fsUtils.globPromise(path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(id))))
        )
      }
    }

    if (toEditFiles.length === 0) {
      throw new ChptrError('No files matching input', 'edit.run', 20)
    }

    cli.action.start('Reading and processing files'.actionStartColor())
    for (const filename of toEditFiles) {
      const fullPath = path.join(this.rootPath, filename)

      const initialContent = await this.fsUtils.readFileContent(fullPath)
      const replacedContent = await this.processContentBack(initialContent)
      await this.fsUtils.writeFile(fullPath, replacedContent)
    }
    const toEditPretty = toEditFiles.map(f => `\n    ${f}`)
    cli.action.stop(`${toEditPretty}\n${toEditFiles.length > 1 ? 'were' : 'was'} modified`.actionStopColor())
  }
}
