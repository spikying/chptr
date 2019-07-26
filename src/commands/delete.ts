import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('command:delete')

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

    const toDeleteFiles: string[] = []

    const numberRegexWithoutAtNumbering = new RegExp('^' + this.softConfig.numbersPattern(false) + '$')
    const numberRegexWithAtNumbering = new RegExp('^' + this.softConfig.numbersPattern(true) + '$')

    const isChapterNumberOnly = numberRegexWithoutAtNumbering.test(nameOrNumber) || numberRegexWithAtNumbering.test(nameOrNumber)

    if (!isChapterNumberOnly) {
      // we will delete all files matching the name entered
      let filePattern = '**/' + nameOrNumber

      const pathName = path.join(this.rootPath, filePattern)
      toDeleteFiles.push(...(await this.fsUtils.listFiles(pathName)))
    } else {
      // we will delete all files matching the number patterns for chapters, metadata and summary
      const id = new ChapterId(this.softConfig.extractNumber(nameOrNumber), this.softConfig.isAtNumbering(nameOrNumber))
      toDeleteFiles.push(...(await this.statistics.getAllFilesForChapter(id)))
    }

    if (toDeleteFiles.length === 0) {
      cli.warn('No files to delete.'.errorColor())
    } else {
      cli.action.start('Deleting file(s) locally and from repository'.actionStartColor())
      await this.git.rm(this.softConfig.mapFilesToBeRelativeToRootPath(toDeleteFiles))
      const toDeletePretty = toDeleteFiles.map(f => `\n    ${f}`)
      cli.action.stop(`${toDeletePretty}\nwere deleted`.actionStopColor())

      await this.CommitToGit(
        `Removed files:\n    ${this.softConfig.mapFilesToBeRelativeToRootPath(toDeleteFiles).join('\n    ')}`,
        undefined,
        true
      )

      // } catch (err) {
      //   this.error(err.toString().errorColor())
      // }

      if (compact) {
        await this.compactFileNumbers()
        await this.CommitToGit(`Compacted file numbers`)
      }
    }
  }
}
