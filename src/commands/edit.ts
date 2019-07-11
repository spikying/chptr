import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { QueryBuilder } from '../queries'

import { d, globPromise } from './base'
import Command from './edit-save-base'

const debug = d('command:edit')

export default class Edit extends Command {
  static description = 'Adjust sentence and paragraph endings to allow for easier editing.'

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
      name: 'filter',
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

    const chapterIds: string[] = []
    const toEditFiles: string[] = []
    if (!argv[0]) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('filter', queryBuilder.textinput('What chapters to put in edit mode? (comma-separated list)', ''))
      const queryResponses: any = await queryBuilder.responses()
      chapterIds.push(...queryResponses.filter.split(',').map((v: string) => parseInt(v, 10)))
    } else {
      //loop through all argv[i] to get all chapter numbers.  If first argument contains commas, it's a single argument to split at ','.
      if (argv[0].split(',').length > 1) {
        chapterIds.push(...argv[0].split(','))
      } else {
        chapterIds.push(...argv)
      }
    }

    for (const id of chapterIds) {
      const num = this.context.extractNumber(id)
      const isAtNumbering = this.configInstance.isAtNumbering(id)

      if (editType === 'all' || editType === 'chapter') {
        toEditFiles.push(
          ...(await globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber(num, isAtNumbering))))
        )
      }
      if (editType === 'all' || editType === 'summary') {
        toEditFiles.push(
          ...(await globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.summaryWildcardWithNumber(num, isAtNumbering))))
        )
      }
    }

    if (toEditFiles.length === 0) {
      this.error('No files matching input'.errorColor())
      this.exit(0)
    }

    cli.action.start('Reading and processing files'.actionStartColor())
    for (const filename of toEditFiles) {
      const fullPath = path.join(this.configInstance.projectRootPath, filename)
      await this.processFileBack(fullPath)
    }
    const toEditPretty = toEditFiles.map(f => `\n    ${f}`)
    cli.action.stop(`modified file${toEditFiles.length > 1 ? 's' : ''}:${toEditPretty}`.actionStopColor())
  }
}
