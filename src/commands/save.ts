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
      description: 'Chapter number to filter which files to stage before saving to repository',
      exclusive: ['filename']
    }),
    filename: flags.string({
      char: 'f',
      required: false,
      description: 'Tracked filename or filename pattern to filter which files to stage before saving to repository'
    }),
    track: flags.boolean({
      char: 't',
      required: false,
      description: 'Force tracking of file if not already in repository',
      dependsOn: ['filename']
    }),
    empty: flags.boolean({
      char: 'e',
      required: false,
      default: false,
      description: 'No manual message in commit',
      exclusive: ['message']
    }),
    message: flags.string({
      char: 'm',
      required: false,
      default: '',
      description: 'Message to use in commit to repository'
    })
  }

  static args = [
    // {
    //   name: 'message',
    //   description: 'Message to use in commit to repository',
    //   required: false,
    //   default: ''
    // }
    {
      name: 'numberOrFilename',
      description: 'Chamber number to save, or tracked filename or filename pattern to save to repository',
      required: false,
      default: '',
      exclusive: ['number', 'filename']
    }
  ]

  static aliases = ['commit']

  static hidden = false

  async run() {
    debug('Running Save command')
    const { args, flags } = this.parse(Save)

    const numberOrFilename = args.numberOrFilename
    let inputNumber = flags.number
    let inputFilename = flags.filename

    if (numberOrFilename != '') {
      const numAtRegex = new RegExp(`^${this.softConfig.numbersPattern(true)}$`)
      const numRegex = new RegExp(`^${this.softConfig.numbersPattern(false)}$`)
      if (numAtRegex.test(numberOrFilename) || numRegex.test(numberOrFilename)) {
        inputNumber = numberOrFilename
      } else {
        inputFilename = numberOrFilename
      }
    }

    const chapterIdFilter = inputNumber
      ? new ChapterId(this.softConfig.extractNumber(inputNumber), this.softConfig.isAtNumbering(inputNumber))
      : null

    const preStageFiles = chapterIdFilter ? await this.gitUtils.GetGitListOfStageableFiles(chapterIdFilter) : []

    for (const toStageFile of preStageFiles) {
      const isChapterFile = chapterIdFilter
        ? minimatch(toStageFile, this.softConfig.chapterWildcardWithNumber(chapterIdFilter))
        : minimatch(toStageFile, this.softConfig.chapterWildcard(true)) || minimatch(toStageFile, this.softConfig.chapterWildcard(false))

      if (isChapterFile) {
        await this.markupUtils.UpdateSingleMetadata(toStageFile)
      }
    }
    const toStageFiles = chapterIdFilter
      ? await this.gitUtils.GetGitListOfStageableFiles(chapterIdFilter)
      : inputFilename
      ? (await this.gitUtils.GetGitListOfStageableFiles()).filter(f => {
          debug(`f=${f}, inputFilename=${inputFilename}`)
          return minimatch(f, inputFilename || '')
        })
      : await this.gitUtils.GetGitListOfStageableFiles()

    if (toStageFiles.length === 0) {
      const filepath = path.join(this.rootPath, inputFilename || '')
      if (inputFilename && (await this.fsUtils.fileExists(filepath))) {
        if (flags.track) {
          toStageFiles.push(this.softConfig.mapFileToBeRelativeToRootPath(filepath))
        } else {
          const warnMsg =
            `That file is not tracked.  You may want to run "` +
            `track '${inputFilename}'`.resultNormalColor() +
            `" or add ` +
            `--track`.resultNormalColor() +
            ` flag to this command.`
          throw new ChptrError(warnMsg, 'save.run', 46)
        }
      } else {
        throw new ChptrError('No files to save to repository', 'save.run', 47)
      }
    }

    const emptyCommitMessage = flags.empty
    const messageFromFlag = flags.message
    const queryBuilder = new QueryBuilder()
    if (!messageFromFlag && !emptyCommitMessage) {
      queryBuilder.add('message', queryBuilder.textinput('Message to use in commit to repository?', ''))
    }
    const queryResponses: any = await queryBuilder.responses()

    debug(`emptyCommitMessage: ${JSON.stringify(emptyCommitMessage)}`)
    debug(`messageFromFlag: ${JSON.stringify(messageFromFlag)}`)
    const message: string =
      (emptyCommitMessage ? '' : (messageFromFlag || queryResponses.message) + '\n') +
      'Modified files:\n    ' +
      `${toStageFiles.join('\n    ')}`

    await this.coreUtils.preProcessAndCommitFiles(message, toStageFiles)
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
