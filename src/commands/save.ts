import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as minimatch from 'minimatch'

import { QueryBuilder } from '../queries'

import { d } from './base'
import Command from './edit-save-base'

const debug = d('command:save')

export default class Save extends Command {
  static description = 'Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.'

  static flags = {
    ...Command.flags,
    filter: flags.string({
      char: 'f',
      required: false,
      default: '',
      description: 'Chapter number or tracked filename to filter which files to stage before saving to repository'
    })
  }

  static args = [
    {
      name: 'message',
      description: 'Message to use in commit to repository',
      required: false,
      default: ''
    }
  ]

  static aliases = ['commit']

  static hidden = false

  async run() {
    debug('Running Save command')
    const { args, flags } = this.parse(Save)

    // TODO: check for tracked filename
    const atFilter = flags.filter ? flags.filter.substring(0, 1) === '@' : false
    const numberFilter = flags.filter ? this.context.extractNumber(flags.filter) : undefined

    debug(`flag filter= ${flags.filter} numberFilter = ${numberFilter}`)
    const preStageFiles = await this.GetGitListOfStageableFiles(numberFilter, atFilter)

    for (const toStageFile of preStageFiles) {
      const isChapterFile = numberFilter
        ? minimatch(toStageFile, this.configInstance.chapterWildcardWithNumber(numberFilter, atFilter))
        : minimatch(toStageFile, this.configInstance.chapterWildcard(true)) || minimatch(toStageFile, this.configInstance.chapterWildcard(false))

      if (isChapterFile) {
        await this.UpdateSingleMetadata(toStageFile)
      }
    }
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

      await this.CommitToGit(message, toStageFiles)
    }
  }

  private async UpdateSingleMetadata(chapterFile: string) {
    cli.action.start('Extracting single metadata'.actionStartColor())

    const markupObjArr = await this.extractMarkup(chapterFile)
    const { markupByFile } = this.objectifyMarkupArray(markupObjArr)
    const modifiedMetadataFiles = await this.writeMetadataInEachFile(markupByFile)
    const modifiedFile = modifiedMetadataFiles[0]

    cli.action.stop(`updated ${modifiedFile.file} with ${modifiedFile.diff}`.actionStopColor())
  }
}
