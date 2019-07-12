import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as minimatch from 'minimatch'
import * as path from 'path'

import { QueryBuilder } from '../queries'

import { d, fileExists } from './base'
import Command from './edit-save-base'

const debug = d('command:save')

export default class Save extends Command {
  static description = 'Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.'

  static flags = {
    ...Command.flags,
    number: flags.string({
      char: 'n',
      required: false,
      default: '',
      description: 'Chapter number to filter which files to stage before saving to repository',
      exclusive: ['filename']
    }),
    filename: flags.string({
      char: 'f',
      required: false,
      default: '',
      description: 'Tracked filename or filename pattern to filter which files to stage before saving to repository'
    }),
    track: flags.boolean({
      char: 't',
      required: false,
      default: false,
      description: 'Force tracking of file if not already in repository',
      dependsOn: ['filename']
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

    const atFilter = flags.number ? flags.number.substring(0, 1) === '@' : false
    const numberFilter = flags.number ? this.context.extractNumber(flags.number) : undefined

    const preStageFiles = flags.number ? await this.GetGitListOfStageableFiles(numberFilter, atFilter) : []

    debug(`flags.number=${flags.number} numberFilter=${numberFilter} at=${atFilter} preStageFiles=${JSON.stringify(preStageFiles)}`)

    for (const toStageFile of preStageFiles) {
      const isChapterFile = numberFilter
        ? minimatch(toStageFile, this.configInstance.chapterWildcardWithNumber(numberFilter, atFilter))
        : minimatch(toStageFile, this.configInstance.chapterWildcard(true)) || minimatch(toStageFile, this.configInstance.chapterWildcard(false))

      if (isChapterFile) {
        await this.UpdateSingleMetadata(toStageFile)
      }
    }
    const toStageFiles = flags.number
      ? await this.GetGitListOfStageableFiles(numberFilter, atFilter)
      : flags.filename
      ? (await this.GetGitListOfStageableFiles()).filter(f => {
          debug(`f=${f}, flags.filename=${flags.filename}`)
          return minimatch(f, flags.filename || '')
        })
      : await this.GetGitListOfStageableFiles()

    if (toStageFiles.length === 0) {
      const filepath = path.join(this.configInstance.projectRootPath, flags.filename || '')
      if (flags.filename && (await fileExists(filepath))) {
        if (flags.track) {
          toStageFiles.push(this.context.mapFileToBeRelativeToRootPath(filepath))
        } else {
          const warnMsg =
            `That file is not tracked.  You may want to run "` +
            `track '${flags.filename}'`.resultNormalColor() +
            `" or add ` +
            `--track`.resultNormalColor() +
            ` flag to this command.`
          this.warn(warnMsg.infoColor())
          this.exit(0)
        }
      } else {
        this.warn('No files to save to repository')
        this.exit(0)
      }
    }

    const queryBuilder = new QueryBuilder()
    if (!args.message) {
      queryBuilder.add('message', queryBuilder.textinput('Message to use in commit to repository?', ''))
    }

    const queryResponses: any = await queryBuilder.responses()

    let message: string = args.message || queryResponses.message || 'Modified files:'
    message += '\n' + `${JSON.stringify(toStageFiles)}`

    await this.CommitToGit(message, toStageFiles)
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
