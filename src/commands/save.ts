import { Args, Flags } from '@oclif/core'
import * as minimatch from 'minimatch'
import * as path from 'node:path'

import { ChapterId } from '../shared/chapter-id'
import { ChptrError } from '../shared/chptr-error'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'
import { compact } from '../flags/compact-flag'
import { Container } from 'typescript-ioc'
import { CoreUtils } from '../shared/core-utils'
import { FsUtils } from '../shared/fs-utils'
import { GitUtils } from '../shared/git-utils'
import { MarkupUtils } from '../shared/markup-utils'
import { SoftConfig } from '../shared/soft-config'
// import Command from './initialized-base'

const debug = d('save')

export default class Save extends BaseCommand<typeof Save> {
  static aliases = ['commit']

  static args = {
    // {
    //   name: 'message',
    //   description: 'Message to use in commit to repository',
    //   required: false,
    //   default: ''
    // }
    numberOrFilename: Args.string({
      default: '',
      description: 'Chamber number to save, or tracked filename or filename pattern to save to repository',
      exclusive: ['number', 'filename'],
      name: 'numberOrFilename',
      required: false
    })
  }

  static description = 'Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.'

  static flags = {
    compact: compact,
    empty: Flags.boolean({
      char: 'e',
      default: false,
      description: 'No manual message in commit',
      exclusive: ['message'],
      required: false
    }),
    filename: Flags.string({
      char: 'f',
      description: 'Tracked filename or filename pattern to filter which files to stage before saving to repository',
      required: false
    }),
    message: Flags.string({
      char: 'm',
      default: '',
      description: 'Message to use in commit to repository',
      required: false
    }),
    number: Flags.string({
      char: 'n',
      description: 'Chapter number to filter which files to stage before saving to repository',
      exclusive: ['filename'],
      required: false
    }),
    track: Flags.boolean({
      char: 't',
      dependsOn: ['filename'],
      description: 'Force tracking of file if not already in repository',
      required: false
    })
  }

  static hidden = false

  async run() {
    debug('Running Save command')

    const fsUtils = Container.get(FsUtils)
    const rootPath = Container.getValue('rootPath')
    const softConfig = Container.get(SoftConfig)
    const markupUtils = Container.get(MarkupUtils)
    const gitUtils = Container.get(GitUtils)
    const coreUtils = Container.get(CoreUtils)

    const { args, flags } = await this.parse(Save)

    const { numberOrFilename } = args
    let inputNumber = flags.number
    let inputFilename = flags.filename

    if (numberOrFilename != '') {
      const numAtRegex = new RegExp(`^${softConfig.numbersPattern(true)}$`)
      const numRegex = new RegExp(`^${softConfig.numbersPattern(false)}$`)
      if (numAtRegex.test(numberOrFilename) || numRegex.test(numberOrFilename)) {
        inputNumber = numberOrFilename
      } else {
        inputFilename = numberOrFilename
      }
    }

    const chapterIdFilter = inputNumber ? new ChapterId(softConfig.extractNumber(inputNumber), softConfig.isAtNumbering(inputNumber)) : null

    const preStageFiles = chapterIdFilter ? await gitUtils.GetGitListOfStageableFiles(chapterIdFilter) : []

    for (const toStageFile of preStageFiles) {
      const isChapterFile = chapterIdFilter
        ? minimatch(toStageFile, softConfig.chapterWildcardWithNumber(chapterIdFilter))
        : minimatch(toStageFile, softConfig.chapterWildcard(true)) || minimatch(toStageFile, softConfig.chapterWildcard(false))

      if (isChapterFile) {
        await markupUtils.UpdateSingleMetadata(toStageFile)
      }
    }

    const toStageFiles = chapterIdFilter
      ? await gitUtils.GetGitListOfStageableFiles(chapterIdFilter)
      : inputFilename
        ? (await gitUtils.GetGitListOfStageableFiles()).filter(f => {
            debug(`f=${f}, inputFilename=${inputFilename}`)
            return minimatch(f, inputFilename || '')
          })
        : await gitUtils.GetGitListOfStageableFiles()

    if (toStageFiles.length === 0) {
      const filepath = path.join(rootPath, inputFilename || '')
      if (inputFilename && (await fsUtils.fileExists(filepath))) {
        if (flags.track) {
          toStageFiles.push(softConfig.mapFileToBeRelativeToRootPath(filepath))
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

    await coreUtils.preProcessAndCommitFiles(message, toStageFiles)
  }
}
