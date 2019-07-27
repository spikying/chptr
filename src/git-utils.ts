import { cli } from 'cli-ux'
import * as d from 'debug'
import minimatch = require('minimatch')
import * as moment from 'moment'
import * as simplegit from 'simple-git/promise'
import { MoveSummary } from 'simple-git/typings/response'

import { ChapterId } from './chapter-id'
import { SoftConfig } from './soft-config'

const debug = d('git-utils')

export class GitUtils {
  private readonly git: simplegit.SimpleGit
  private readonly softConfig: SoftConfig

  constructor(softConfig: SoftConfig, rootPath: string) {
    this.git = simplegit(rootPath)
    this.softConfig = softConfig
  }

  public async CommitToGit(
    message: string,
    preProcessingCallback: (files: string[]) => Promise<void>,
    toStageFiles?: string[],
    forDeletes = false
  ) {
    toStageFiles = toStageFiles || (await this.GetGitListOfStageableFiles())
    if (toStageFiles.length > 0 || forDeletes) {
      // try {
      cli.action.start('Saving file(s) in repository'.actionStartColor())

      // await this.coreUtils.processChapterFilesBeforeSaving(toStageFiles)
      await preProcessingCallback(toStageFiles)
      debug(`after processing file`)

      if (!forDeletes) {
        await this.git.add(toStageFiles)
      }
      debug(`after adding files`)
      await this.git.addConfig('user.name', this.softConfig.config.projectAuthor.name)
      await this.git.addConfig('user.email', this.softConfig.config.projectAuthor.email)

      const commitSummary = await this.git.commit(message)
      const hasRemote: boolean = await this.git.getRemotes(false).then(result => {
        return result.find(value => value.name === 'origin') !== undefined
      })
      if (hasRemote) {
        await this.git.push()
        await this.git.pull()
      }

      const toStagePretty = toStageFiles.map(f => `\n    ${f}`.infoColor())
      cli.action.stop(
        `\nCommited and pushed ${commitSummary.commit.resultHighlighColor()}:\n${message.infoColor()}\nFile${
          toStageFiles.length > 1 ? 's' : ''
        }:${toStagePretty}`.actionStopColor()
      )
      // } catch (err) {
      //   this.error(err.toString().errorColor())
      // }
    }
  }

  public async GetGitListOfStageableFiles(chapterId?: ChapterId): Promise<string[]> {
    const gitStatus = await this.git.status()

    const unQuote = function(value: string) {
      if (!value) {
        return value
      }
      return value.replace(/"(.*)"/, '$1')
    }

    const onlyUnique = function(value: any, index: number, self: any) {
      return self.indexOf(value) === index
    }

    const unfilteredFileList = (await this.git.diff(['--name-only']))
      .split('\n')
      // .concat(gitStatus.deleted.map(unQuote)) //If they are removed by git.rm it is not necessary to "readd" then
      .concat(gitStatus.modified.map(unQuote))
      // .concat(gitStatus.created.map(unQuote)) //They are added manually through Add and Track command
      .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
      .filter(onlyUnique)

    // debug(`unfilteredFileList=${JSON.stringify(unfilteredFileList)}`)

    return unfilteredFileList
      .filter(val => val !== '')
      .filter(val => {
        return chapterId
          ? minimatch(val, this.softConfig.chapterWildcardWithNumber(chapterId)) ||
              minimatch(val, this.softConfig.metadataWildcardWithNumber(chapterId)) ||
              minimatch(val, this.softConfig.summaryWildcardWithNumber(chapterId))
          : true
      })
  }

  public async GetGitListOfUntrackedFiles(): Promise<string[]> {
    const gitStatus = await this.git.status()

    const unQuote = function(value: string) {
      if (!value) {
        return value
      }
      return value.replace(/"(.*)"/, '$1')
    }

    return gitStatus.not_added.map(unQuote).filter(val => val !== '')
  }

  // public async checkIsRepo(): Promise<boolean> {
  //   return this.git.checkIsRepo()
  // }

  public async mv(from: string | string[], to: string): Promise<MoveSummary> {
    return this.git.mv(from, to)
  }

  public async rm(paths: string | string[]): Promise<void> {
    return this.git.rm(paths)
  }

  public async add(files: string | string[]) {
    return this.git.add(files)
  }

  public async showHeadVersionOfFile(filepath: string): Promise<string> {
    return this.git.show([`HEAD:${this.softConfig.mapFileToBeRelativeToRootPath(filepath).replace(/\\/, '/')}`])
  }

  // public async raw(commands: string | string[]): Promise<string> {
  //   return this.git.raw(commands)
  // }
  public async GetGitListOfVersionsOfFile(
    filepath: string,
    extractAll: boolean
  ): Promise<
    {
      file: string
      hash: string
      date: moment.Moment
      subject: string
      content: string
    }[]
  > {
    const file = this.softConfig.mapFileToBeRelativeToRootPath(filepath)
    const beginBlock = '########'
    const endFormattedBlock = '------------------------ >8 ------------------------'
    const gitLogArgs = ['log', '-c', '--follow', `--pretty=format:"${beginBlock}%H;%aI;%s${endFormattedBlock}"`]
    if (!extractAll) {
      gitLogArgs.push(`--since="${moment().add(-1, 'week')}"`)
    }
    return (await this.git.raw([...gitLogArgs, file]))
      .split(beginBlock)
      .filter(l => l !== '')
      .map(l => {
        const s = l.split(endFormattedBlock)
        const logArray = s[0].split(';')
        return { file, hash: logArray[0], date: moment(logArray[1]), subject: logArray[2], content: s[1] || '' }
      })
  }
}
