import { cli } from 'cli-ux'
import * as d from 'debug'
import minimatch = require('minimatch')
import * as simplegit from 'simple-git/promise'

import { ChapterId } from './chapter-id'
import { CoreUtils } from './core-utils'
import { SoftConfig } from './soft-config'

const debug = d('git-wrapper')

export class GitWrapper {
  private readonly git: simplegit.SimpleGit
  private readonly softConfig: SoftConfig
  private readonly coreUtils: CoreUtils

  constructor(softConfig: SoftConfig, rootPath: string) {
    this.git = simplegit(rootPath)
    this.softConfig = softConfig
    this.coreUtils = new CoreUtils(softConfig, rootPath)
  }

  public async CommitToGit(message: string, toStageFiles?: string[], forDeletes = false) {
    toStageFiles = toStageFiles || (await this.GetGitListOfStageableFiles())
    if (toStageFiles.length > 0 || forDeletes) {
      // try {
      cli.action.start('Saving file(s) in repository'.actionStartColor())

      await this.coreUtils.processChapterFilesBeforeSaving(toStageFiles)
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
}
