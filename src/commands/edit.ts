import { Args, Flags, ux } from '@oclif/core'
import { glob } from 'glob'
import * as path from 'node:path'

import { ChapterId } from '../shared/chapter-id'
import { ChptrError } from '../shared/chptr-error'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'
import { Container } from 'typescript-ioc'
import { SoftConfig } from '../shared/soft-config'
import { FsUtils } from '../shared/fs-utils'
import { CoreUtils } from '../shared/core-utils'
import { actionStartColor, actionStopColor } from '../shared/colorize'
// import Command from './initialized-base'

const debug = d('edit')

export default class Edit extends BaseCommand<typeof Edit> {
  static aliases = ['modify', 'mod']

  static args = {
    chapterIds: Args.string({
      default: '',
      description: 'Chapter number(s) to modify, comma-separated or dash-separated for a range.',
      name: 'chapterIds',
      required: false
    })
  }

  static description = 'Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.'

  static flags = {
    type: Flags.string({
      char: 't',
      default: 'all',
      description: 'Edit either chapter file, summary file or all.',
      options: ['all', 'summary', 'chapter']
    })
  }

  static hidden = false

  // for variable length arguments (https://oclif.io/docs/args)
  static strict = false

  async run() {
    debug('Running Edit command')

    const softConfig = Container.get(SoftConfig)
    const rootPath = Container.getValue('rootPath')
    const fsUtils = Container.get(FsUtils)
    const coreUtils = Container.get(CoreUtils)

    const { argv, flags } = await this.parse(Edit)

    const editType = flags.type

    const argsArray: string[] = argv as string[]
    const chapterIdsString: string[] = []
    const toEditFiles: string[] = []
    if (!argsArray[0]) {
      // no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add(
        'chapterIds',
        queryBuilder.textinput('What chapters to put in edit mode? (comma-separated list or dash-separated range)', '')
      )
      const queryResponses: any = await queryBuilder.responses()
      // chapterIdsString.push(...queryResponses.chapterIds.split(','))
      argsArray.push(...queryResponses.chapterIds.split(' '))
    }

    // loop through all argv[i] to get all chapter numbers.  If any argument contains commas, it will be split at ','.  If it has dashes, it will be interpolated.
    for (const arg of argsArray) {
      if (arg.split(',').length > 1) {
        chapterIdsString.push(...arg.split(','))
      } else if (arg.split('-').length == 2) {
        const lowRange: number = Number.parseInt(arg.split('-')[0], 10)
        const hiRange: number = Number.parseInt(arg.split('-')[1], 10)
        // const range = Array.from({ length: hiRange - lowRange }, (v, k) => k + 1).map(v => v.toString())
        const range = new Array(hiRange - lowRange + 1)
          .fill(0)
          .map((_, idx) => lowRange + idx)
          .map(v => v.toString())
        debug(`range: ${JSON.stringify(range)}`)
        chapterIdsString.push(...range)
      } else {
        chapterIdsString.push(arg)
      }
    }

    for (const id of chapterIdsString.map(
      (input: string) => new ChapterId(softConfig.extractNumber(input), softConfig.isAtNumbering(input))
    )) {
      if (editType === 'all' || editType === 'chapter') {
        toEditFiles.push(...(await glob(path.join(rootPath, softConfig.chapterWildcardWithNumber(id)))))
      }

      if (editType === 'all' || editType === 'summary') {
        toEditFiles.push(...(await glob(path.join(rootPath, softConfig.summaryWildcardWithNumber(id)))))
      }
    }

    if (toEditFiles.length === 0) {
      throw new ChptrError('No files matching input', 'edit.run', 20)
    }

    ux.action.start(actionStartColor('Reading and processing files'))
    for (const filename of toEditFiles) {
      const fullPath = path.join(rootPath, filename)

      const initialContent = await fsUtils.readFileContent(fullPath)
      const replacedContent = await coreUtils.processContentBack(initialContent)
      await fsUtils.writeFile(fullPath, replacedContent)
    }

    const toEditPretty = toEditFiles.map(f => `\n    ${f}`)
    ux.action.stop(actionStopColor(`${toEditPretty}\n${toEditFiles.length > 1 ? 'were' : 'was'} modified`))
  }
}
