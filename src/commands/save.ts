import { flags } from '@oclif/command'
// import { cli } from 'cli-ux'
import * as minimatch from 'minimatch'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('save')

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

    // const atFilter = flags.number ? flags.number.substring(0, 1) === '@' : false
    // const numberFilter = flags.number ? this.softConfig.extractNumber(flags.number) : undefined
    const chapterIdFilter = flags.number
      ? new ChapterId(this.softConfig.extractNumber(flags.number), this.softConfig.isAtNumbering(flags.number))
      : null

    const preStageFiles = chapterIdFilter ? await this.GetGitListOfStageableFiles(chapterIdFilter) : []

    for (const toStageFile of preStageFiles) {
      const isChapterFile = chapterIdFilter
        ? minimatch(toStageFile, this.softConfig.chapterWildcardWithNumber(chapterIdFilter))
        : minimatch(toStageFile, this.softConfig.chapterWildcard(true)) || minimatch(toStageFile, this.softConfig.chapterWildcard(false))

      if (isChapterFile) {
        await this.markupUtils.UpdateSingleMetadata(toStageFile)
      }
    }
    const toStageFiles = chapterIdFilter
      ? await this.GetGitListOfStageableFiles(chapterIdFilter)
      : flags.filename
      ? (await this.GetGitListOfStageableFiles()).filter(f => {
          debug(`f=${f}, flags.filename=${flags.filename}`)
          return minimatch(f, flags.filename || '')
        })
      : await this.GetGitListOfStageableFiles()

    if (toStageFiles.length === 0) {
      const filepath = path.join(this.rootPath, flags.filename || '')
      if (flags.filename && (await this.fsUtils.fileExists(filepath))) {
        if (flags.track) {
          toStageFiles.push(this.softConfig.mapFileToBeRelativeToRootPath(filepath))
        } else {
          const warnMsg =
            `That file is not tracked.  You may want to run "` +
            `track '${flags.filename}'`.resultNormalColor() +
            `" or add ` +
            `--track`.resultNormalColor() +
            ` flag to this command.`
          throw new ChptrError(warnMsg, 'save.run', 46)
        }
      } else {
        throw new ChptrError('No files to save to repository', 'save.run', 47)
      }
    }

    const queryBuilder = new QueryBuilder()
    if (!args.message) {
      queryBuilder.add('message', queryBuilder.textinput('Message to use in commit to repository?', ''))
    }
    const queryResponses: any = await queryBuilder.responses()

    let message: string = args.message || queryResponses.message || 'Modified files:'
    message += '\n    ' + `${toStageFiles.join('\n    ')}`

    await this.CommitToGit(message, toStageFiles)
  }

  // public async UpdateSingleMetadata(chapterFile: string) {
  //   cli.action.start('Extracting single metadata'.actionStartColor())

  //   const markupObjArr = await this.markupUtils.extractMarkupFromChapterFile(chapterFile)
  //   const markupByFile = this.markupUtils.getMarkupByFile(markupObjArr)
  //   const modifiedMetadataFiles = await this.markupUtils.writeMetadataInEachFile(markupByFile)
  //   const modifiedFile = modifiedMetadataFiles[0]

  //   cli.action.stop(`updated ${modifiedFile.file} with ${modifiedFile.diff}`.actionStopColor())
  // }
}
