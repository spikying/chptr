import { ux } from '@oclif/core'
import * as moment from 'moment'
import { LogOptions, MoveSummary, SimpleGit } from 'simple-git'
import { Inject, InjectValue, Singleton } from 'typescript-ioc'
import { ChapterId } from './chapter-id'
import { actionStartColor, actionStopColor, infoColor, resultHighlighColor } from './colorize'
import { SoftConfig } from './soft-config'
import minimatch = require('minimatch')

const debug = require('debug')('git-utils')

@Singleton
export class GitUtils {
  private readonly _git: SimpleGit
  private _gitConfigAdded: boolean
  private readonly softConfig: SoftConfig

  constructor(@Inject softConfig: SoftConfig, @InjectValue('git') git: SimpleGit) {
    debug('CONSTRUCTOR GIT-UTILS')
    this._git = git
    this._gitConfigAdded = false
    this.softConfig = softConfig
  }

  // todo: split git.add and git.commit to enable doing everything without committing, e.g. for functions like rename or others that don't need a commit automatically

  public async add(files: string | string[]) {
    const git = await this.git()
    return git.add(files)
  }

  public async CommitToGit(
    message: string,
    preProcessingCallback: (files: string[]) => Promise<void>,
    toStageFiles?: string[],
    forDeletes = false
  ) {
    debug('git-utils.CommitToGit')
    const git = await this.git()
    toStageFiles = toStageFiles || (await this.GetGitListOfStageableFiles())
    if (toStageFiles.length > 0 || forDeletes) {
      // try {
      ux.action.start(actionStartColor('Saving file(s) in repository'))

      // await this.coreUtils.processChapterFilesBeforeSaving(toStageFiles)
      await preProcessingCallback(toStageFiles)
      debug(`after processing file`)

      if (!forDeletes) {
        await git.add(toStageFiles)
      }

      const commitSummary = await git.commit(message)
      const hasRemote: boolean = await git.getRemotes(false).then(result => result.find(value => value.name === 'origin') !== undefined)
      if (hasRemote) {
        await git.push()
        await git.pull()
      }

      const toStagePretty = toStageFiles.map(f => infoColor(`\n    ${f}`))
      ux.action.stop(
        actionStopColor(`\nCommited and pushed ${resultHighlighColor(commitSummary.commit)}:\n${infoColor(message)}\nFile${
          toStageFiles.length > 1 ? 's' : ''
        }:${toStagePretty}`)
      )
      // } catch (err) {
      //   this.error(err.toString().errorColor())
      // }
    }
  }

  public async GetGitContentOfHistoryFile(hash: string, file: string): Promise<string> {
    debug(`getting content of history file: ${file}`)
    const git = await this.git()
    const content = await git.show([`${hash}:${file}`])
    return content
  }

  // public async checkIsRepo(): Promise<boolean> {
  //   return git.checkIsRepo()
  // }

  public async GetGitListOfHistoryFiles(
    sinceDays: number
  ): Promise<{ chapterFiles: string[]; date: moment.Moment; hash: string; summaryFiles: string[] }[]> {
    debug('In GetGitListOfHistoryFiles')
    const allLastCommitsPerDay = await this.GetAllLastCommitsPerDay(sinceDays)
    const value: { chapterFiles: string[]; date: moment.Moment; hash: string; summaryFiles: string[] }[] = []

    for (const commit of allLastCommitsPerDay) {
      const allFilesInCommit = await this.GetAllFilesInCommit(commit.hash)
      const chapterFiles = allFilesInCommit.filter(
        f => this.softConfig.chapterRegex(true).test(f) || this.softConfig.chapterRegex(false).test(f)
      )
      const summaryFiles = allFilesInCommit.filter(
        f => this.softConfig.summaryRegex(true).test(f) || this.softConfig.summaryRegex(false).test(f)
      )
      value.push({ chapterFiles, date: moment(commit.date).startOf('day'), hash: commit.hash, summaryFiles })
    }

    debug(`value: ${JSON.stringify(value)}`)
    return value
  }

  public async GetGitListOfStageableFiles(chapterId?: ChapterId): Promise<string[]> {
    debug('In GetGitListOfStageableFiles')
    const git = await this.git()
    const gitStatus = await git.status()

    const unQuote = function (value: string) {
      if (!value) {
        return value
      }

      return value.replace(/"(.*)"/, '$1')
    }

    const onlyUnique = function (value: any, index: number, self: any) {
      return self.indexOf(value) === index
    }

    const unfilteredFileList = (await git.diff(['--name-only']))
      .split('\n')
      // .concat(gitStatus.deleted.map(unQuote)) //If they are removed by git.rm it is not necessary to "readd" then
      .concat(gitStatus.modified.map(unQuote))
      // .concat(gitStatus.created.map(unQuote)) //They are added manually through Add and Track command
      .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
      .filter(onlyUnique)

    debug(`unfilteredFileList=${JSON.stringify(unfilteredFileList)}`)

    return unfilteredFileList
      .filter(val => val !== '')
      .filter(val =>
        chapterId
          ? minimatch(val, this.softConfig.chapterWildcardWithNumber(chapterId)) ||
            minimatch(val, this.softConfig.metadataWildcardWithNumber(chapterId)) ||
            minimatch(val, this.softConfig.summaryWildcardWithNumber(chapterId))
          : true
      )
  }

  public async GetGitListOfUntrackedFiles(): Promise<string[]> {
    const git = await this.git()
    const gitStatus = await git.status()

    const unQuote = function (value: string) {
      if (!value) {
        return value
      }

      return value.replace(/"(.*)"/, '$1')
    }

    return gitStatus.not_added.map(unQuote).filter(val => val !== '')
  }

  public async GetGitListOfVersionsOfFile(
    filepath: string,
    extractAll: boolean
  ): Promise<
    {
      content: string
      date: moment.Moment
      file: string
      hash: string
      subject: string
    }[]
  > {
    const git = await this.git()
    const file = this.softConfig.mapFileToBeRelativeToRootPath(filepath)
    const beginBlock = '########'
    const endFormattedBlock = '------------------------ >8 ------------------------'
    const gitLogArgs = ['log', '-c', '--follow', `--pretty=format:"${beginBlock}%H;%aI;%s${endFormattedBlock}"`]
    if (!extractAll) {
      gitLogArgs.push(`--since="${moment().add(-1, 'week')}"`)
    }

    return (await git.raw([...gitLogArgs, file]))
      .split(beginBlock)
      .filter(l => l !== '')
      .map(l => {
        const s = l.split(endFormattedBlock)
        const logArray = s[0].split(';')
        return { content: s[1] || '', date: moment(logArray[1]), file, hash: logArray[0], subject: logArray[2] }
      })
  }

  public async mv(from: string | string[], to: string): Promise<MoveSummary> {
    const git = await this.git()
    return git.mv(from, to)
  }

  public async rm(paths: string | string[]): Promise<void> {
    const git = await this.git()
    return git.rm(paths)
  }

  public async showHeadVersionOfFile(filepath: string): Promise<string> {
    const git = await this.git()
    return git.show([`HEAD:${this.softConfig.mapFileToBeRelativeToRootPath(filepath).replace(/\\/, '/')}`])
  }

  private async GetAllFilesInCommit(hash: string): Promise<string[]> {
    const git = await this.git()

    const allFiles = await git.raw(['ls-tree', '-r', '--name-only', hash])
    return allFiles.split('\n').filter(Boolean)
  }

  private async GetAllLastCommitsPerDay(sinceDays: number): Promise<LogFields[]> {
    const git = await this.git()

    const options: LogOptions<LogFields> | any = {}
    options.splitter = ';'
    options.format = {
      date: '%aI',
      hash: '%h'
    }
    if (sinceDays > 0) {
      options['--since'] = `"${moment().subtract(sinceDays, 'days')}"`
    }

    const allCommits = await git.log(options)
    const allDates: string[] = []
    const allLastCommitsPerDay: LogFields[] = []
    for (const c of allCommits.all) {
      const commitDate = moment(c.date).startOf('day').toString()
      if (!allDates.includes(commitDate)) {
        allDates.push(commitDate)
        allLastCommitsPerDay.push(c)
      }
    }

    // debug(`allLastCommitsPerDay=${JSON.stringify(allLastCommitsPerDay, null, 2)}`)
    return allLastCommitsPerDay
  }

  private async GetModifiedFilesInCommit(hash: string): Promise<string[]> {
    const git = await this.git()

    const allFiles = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-only', hash])
    return allFiles.split('\n').filter(Boolean)
  }

  private async git(): Promise<SimpleGit> {
    debug('getting git instance')
    if (!this._gitConfigAdded) {
      debug('adding config to git')
      const quotepath = await this._git.addConfig('core.quotepath', '')
      if (quotepath !== 'off') {
        await this._git.addConfig('core.quotepath', 'off')
      }

      await this._git.addConfig('user.name', this.softConfig.config.projectAuthor.name)
      await this._git.addConfig('user.email', this.softConfig.config.projectAuthor.email)

      this._gitConfigAdded = true
    }

    return this._git
  }
}

interface LogFields {
  date: string
  hash: string
}
