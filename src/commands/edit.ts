import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('edit')

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
      description: 'Chapter number(s) to modify, comma-separated or dash-separated for a range.',
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

    const argsArray: string[] = argv
    const chapterIdsString: string[] = []
    const toEditFiles: string[] = []
    if (!argsArray[0]) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add(
        'chapterIds',
        queryBuilder.textinput('What chapters to put in edit mode? (comma-separated list or dash-separated range)', '')
      )
      const queryResponses: any = await queryBuilder.responses()
      // chapterIdsString.push(...queryResponses.chapterIds.split(','))
      argsArray.push(...queryResponses.chapterIds.split(' '))
    }

    //loop through all argv[i] to get all chapter numbers.  If any argument contains commas, it will be split at ','.  If it has dashes, it will be interpolated.
    for (const arg of argsArray) {
      if (arg.split(',').length > 1) {
        chapterIdsString.push(...arg.split(','))
      } else if (arg.split('-').length == 2) {
        const lowRange: number = parseInt(arg.split('-')[0], 0)
        const hiRange: number = parseInt(arg.split('-')[1], 0)
        // const range = Array.from({ length: hiRange - lowRange }, (v, k) => k + 1).map(v => v.toString())
        const range = Array(hiRange - lowRange + 1).fill(undefined, undefined, undefined).map((_, idx) => lowRange + idx).map(v => v.toString())
        debug(`range: ${JSON.stringify(range)}`)
        chapterIdsString.push(...range)
      } else {
        chapterIdsString.push(arg)
      }
    }

    for (const id of chapterIdsString.map(
      (input: string) => new ChapterId(this.softConfig.extractNumber(input), this.softConfig.isAtNumbering(input))
    )) {
      if (editType === 'all' || editType === 'chapter') {
        toEditFiles.push(...(await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(id)))))
      }
      if (editType === 'all' || editType === 'summary') {
        toEditFiles.push(...(await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(id)))))
      }
    }

    if (toEditFiles.length === 0) {
      throw new ChptrError('No files matching input', 'edit.run', 20)
    }

    cli.action.start('Reading and processing files'.actionStartColor())
    for (const filename of toEditFiles) {
      const fullPath = path.join(this.rootPath, filename)

      const initialContent = await this.fsUtils.readFileContent(fullPath)
      const replacedContent = await this.coreUtils.processContentBack(initialContent)
      await this.fsUtils.writeFile(fullPath, replacedContent)
    }
    const toEditPretty = toEditFiles.map(f => `\n    ${f}`)
    cli.action.stop(`${toEditPretty}\n${toEditFiles.length > 1 ? 'were' : 'was'} modified`.actionStopColor())
  }
}
