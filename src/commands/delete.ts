import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as glob from 'glob'
import * as path from 'path'

import { QueryBuilder } from '../queries'

import { d, listFiles } from './base'
import Command from './edit-save-base'

const debug = d('command:delete')

export default class Delete extends Command {
  static description = 'Delete a chapter or tracked file locally and in the repository'

  static flags = {
    ...Command.flags,
    // type: flags.string({
    //   char: 't',
    //   description: 'Delete either chapter file, summary file, metadata file or all.',
    //   default: 'all',
    //   options: ['all', 'summary', 'chapter', 'metadata'],
    // }),
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false,
    }),
  }

  static args = [
    {
      name: 'name',
      description: 'chapter number or filename to delete',
      required: false,
      default: '',
    },
  ]

  static aliases = ['del']

  static hidden = false

  async run() {
    debug('Running Delete command')
    const { args, flags } = this.parse(Delete)

    // const deleteType = flags.type
    const compact = flags.compact

    const queryBuilder = new QueryBuilder()

    if (!args.name) {
      //TODO: ask 1st if it's by chapter number or tracked file, then allow for tracked file scrolling
      queryBuilder.add('name', queryBuilder.textinput('Chapter number or filename to delete?'))
    }

    const queryResponses: any = await queryBuilder.responses()
    const nameOrNumber: any = args.name || queryResponses.name

    if (!nameOrNumber) {
      this.error('Name or number input empty'.errorColor())
      this.exit(1)
    }

    const toDeleteFiles: string[] = []

    const numberRegexWithoutAtNumbering = new RegExp('^' + this.configInstance.numbersPattern(false) + '$')
    const numberRegexWithAtNumbering = new RegExp('^' + this.configInstance.numbersPattern(true) + '$')

    const isAtNumber = nameOrNumber.substring(0, 1) === '@'
    const isChapterNumberOnly = numberRegexWithoutAtNumbering.test(nameOrNumber) || numberRegexWithAtNumbering.test(nameOrNumber)

    if (!isChapterNumberOnly) {
      // we will delete all files matching the name entered
      let filePattern = '*' + nameOrNumber + '*'
      if (glob.hasMagic(nameOrNumber)) {
        filePattern = nameOrNumber
      }
      const pathName = path.join(this.configInstance.projectRootPath, filePattern)
      toDeleteFiles.push(...(await listFiles(pathName)))
    } else {
      // we will delete all files matching the number patterns for chapters, metadata and summary
      const filterNumber = this.context.extractNumber(nameOrNumber)
      const globPatterns: string[] = []
      // if (deleteType === 'all' || deleteType === 'chapter') {
        globPatterns.push(this.configInstance.chapterWildcardWithNumber(filterNumber, isAtNumber))
      // }
      // if (deleteType === 'all' || deleteType === 'summary') {
        globPatterns.push(this.configInstance.summaryWildcardWithNumber(filterNumber, isAtNumber))
      // }
      // if (deleteType === 'all' || deleteType === 'metadata') {
        globPatterns.push(this.configInstance.metadataWildcardWithNumber(filterNumber, isAtNumber))
      // }

      for (const gp of globPatterns) {
        const pathName = path.join(this.configInstance.projectRootPath, gp)
        toDeleteFiles.push(...(await listFiles(pathName)))
      }
    }

    if (toDeleteFiles.length === 0) {
      cli.warn('No files to delete.'.errorColor())
      cli.exit(0)
    }

    try {
      cli.action.start('Deleting file(s) locally and from repository'.actionStartColor())
      await this.git.rm(this.context.mapFilesToBeRelativeToRootPath(toDeleteFiles))
      const toDeletePretty = toDeleteFiles.map(f => `\n    ${f}`)
      cli.action.stop(`${toDeletePretty}\nwere deleted`.actionStopColor())
    } catch (err) {
      this.error(err.errorColor())
    }

    if (compact) {
      await this.compactFileNumbers()
    }

    await this.CommitToGit(`Removed files: ${JSON.stringify(toDeleteFiles)}${compact ? '\nCompacted file numbers' : ''}`)
  }
}
