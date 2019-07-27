import { cli } from 'cli-ux'
import { observableDiff } from 'deep-diff'
import * as path from 'path'
import * as simplegit from 'simple-git/promise'
import { MoveSummary } from 'simple-git/typings/response'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { CoreUtils } from '../core-utils'
import { GitUtils } from '../git-utils'
import { MarkupUtils } from '../markup-utils'
import { SoftConfig } from '../soft-config'
import { Statistics } from '../statistics'
import { tableize } from '../ui-utils'

import Command, { d } from './base'

const debug = d('command:initialized-base')

export default abstract class extends Command {
  public get softConfig(): SoftConfig {
    return this._softConfig as SoftConfig
  }
  public get statistics(): Statistics {
    return this._statistics as Statistics
  }
  public get markupUtils(): MarkupUtils {
    return this._markupUtils as MarkupUtils
  }
  public get gitUtils(): GitUtils {
    return this._gitUtils as GitUtils
  }
  public get coreUtils(): CoreUtils {
    return this._coreUtils as CoreUtils
  }

  static flags = {
    ...Command.flags
  }

  // TODO: put --compact flag here? it's in build, delete and reorder now.

  private _softConfig: SoftConfig | undefined
  private _statistics: Statistics | undefined
  private _markupUtils: MarkupUtils | undefined
  private _gitUtils: GitUtils | undefined
  private _coreUtils: CoreUtils | undefined

  private _lastConfigObj: any
  private _actualConfigObj: any

  async init() {
    debug('init of initialized-base')
    await super.init()

    //#region checkIfInitialized
    const git = simplegit(this.rootPath)
    const isRepo = await git.checkIsRepo()
    const hasConfigFolder = await this.fsUtils.fileExists(this.hardConfig.configPath)
    const hasConfigJSON5File = await this.fsUtils.fileExists(this.hardConfig.configJSON5FilePath)
    const hasConfigYAMLFile = await this.fsUtils.fileExists(this.hardConfig.configYAMLFilePath)

    if (!isRepo || !hasConfigFolder || !(hasConfigJSON5File || hasConfigYAMLFile)) {
      throw new ChptrError('Directory was not initialized.  Run `init` command.', 'initialized-base.init', 9)
    }
    //#endregion

    //#region bootstrap all configs and utils
    this._softConfig = new SoftConfig(this.rootPath)
    this._statistics = new Statistics(this.softConfig, this.rootPath)
    this._markupUtils = new MarkupUtils(this.softConfig, this.rootPath)
    this._gitUtils = new GitUtils(this.softConfig, this.rootPath)
    this._coreUtils = new CoreUtils(this.softConfig, this.rootPath)
    //#endregion

    //#region check for changes to config files
    await this.RenameFilesIfNewPattern()
    await this.MoveToNewBuildDirectory()
    await this.RenameProjectTitle()
    await this.CheckIfStepOrInitialNumberHaveChanged()
    //#endregion

    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)
  }

  public async finally() {
    await super.finally()
    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)
  }

  //#region config watches
  public async RenameFilesIfNewPattern(): Promise<boolean> {
    let result = false
    const { lastConfigObj, actualConfigObj } = await this.getLastAndActualConfigObjects()

    const oldVsNew: {
      // needsName: boolean;
      oldPattern: string
      newPattern: string
    }[] = []
    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => {
          return previous || current.indexOf('Pattern') > 0
        }, false)
      ) {
        const fileType = d.path && d.path[0]
        const oldPattern = d.lhs.replace('.<ext>', `.${this.softConfig.configStyle.toLowerCase()}`)
        const newPattern = this.fsUtils.sanitizeFileName(d.rhs.replace('.<ext>', `.${this.softConfig.configStyle.toLowerCase()}`), true)
        // const needsName = oldPattern.indexOf('NAME') === -1
        debug(`fileType=${fileType}, oldPattern=${oldPattern}, newPattern=${newPattern}`)
        oldVsNew.push({
          // needsName,
          oldPattern,
          newPattern
        })
      }
    })

    debug(`old vs new: ${JSON.stringify(oldVsNew)}`)

    const oldChapterPattern = lastConfigObj.chapterPattern

    const movePromises: Promise<MoveSummary>[] = []
    const movesToExecute: { originalFile: string; renamedFile: string }[] = []
    for (const oldAndNew of oldVsNew) {
      const files = (await this.softConfig.getAllFilesForPattern(oldAndNew.oldPattern)) || []

      for (const file of files) {
        const reNormal = this.softConfig.patternRegexer(oldAndNew.oldPattern, false)
        const reAtNumber = this.softConfig.patternRegexer(oldAndNew.oldPattern, true)
        const isAtNumber = this.softConfig.isAtNumbering(file)
        const rootedFile = this.softConfig.mapFileToBeRelativeToRootPath(file)
        const numAsString = rootedFile.replace(isAtNumber ? reAtNumber : reNormal, '$1')
        const currentId = new ChapterId(parseInt(numAsString, 10), isAtNumber)

        const nameMatch = (currentId.isAtNumber ? reAtNumber : reNormal).exec(rootedFile)
        debug(`nameMatch=${JSON.stringify(nameMatch)} nameMatch.length=${nameMatch && nameMatch.length}`)
        debug(`$2=${nameMatch && nameMatch.length >= 3 ? nameMatch[2] : '---'}`)
        const name: string =
          nameMatch && nameMatch.length >= 3
            ? nameMatch[2]
            : await this.softConfig.getTitleOfChapterFromOldChapterFilename(oldChapterPattern, currentId)
        debug(`file=${file} num=${numAsString} name=${name}`)

        const renamedFile = oldAndNew.newPattern.replace(/NUM/g, (currentId.isAtNumber ? '@' : '') + numAsString).replace(/NAME/g, name)

        await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, renamedFile))

        movesToExecute.push({ originalFile: rootedFile, renamedFile })
      }
    }
    for (const moveToExec of movesToExecute) {
      result = true
      movePromises.push(this.gitUtils.mv(moveToExec.originalFile, moveToExec.renamedFile))
    }

    await Promise.all(movePromises)
    return result
  }

  public async MoveToNewBuildDirectory(): Promise<void> {
    const { lastConfigObj, actualConfigObj } = await this.getLastAndActualConfigObjects()

    let oldDir = ''
    let newDir = ''

    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => {
          return previous || current === 'buildDirectory'
        }, false)
      ) {
        oldDir = d.lhs
        newDir = this.fsUtils.sanitizeFileName(d.rhs, true)
      }
    })

    if (oldDir !== newDir) {
      const files = await this.fsUtils.listFiles(path.join(this.rootPath, oldDir, '**/*.*'))
      debug(`move to new build dir : files=${files}`)
      await this.fsUtils.createSubDirectoryFromDirectoryPathIfNecessary(path.join(this.rootPath, newDir))

      for (const file of files) {
        const newFile = path.relative(path.join(this.rootPath, oldDir), file)
        await this.fsUtils.moveFile(file, path.join(this.rootPath, newDir, newFile))
      }

      const gitIgnoreContent = await this.fsUtils.readFileContent(this.hardConfig.gitignoreFilePath)
      const newGitIgnoreContent = gitIgnoreContent.replace(oldDir, newDir.replace(/\\/g, '/'))
      await this.fsUtils.writeFile(this.hardConfig.gitignoreFilePath, newGitIgnoreContent)
    }
  }

  public async RenameProjectTitle() {
    const { lastConfigObj, actualConfigObj } = await this.getLastAndActualConfigObjects()

    let oldTitle = ''
    let newTitle = ''

    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => {
          return previous || current === 'projectTitle'
        }, false)
      ) {
        oldTitle = d.lhs
        newTitle = d.rhs
      }
    })

    if (oldTitle !== newTitle) {
      const oldReadmeContent = await this.fsUtils.readFileContent(this.hardConfig.readmeFilePath)
      if (oldTitle === (await this.markupUtils.extractTitleFromString(oldReadmeContent))) {
        const newReadmeContent = oldReadmeContent.replace(this.markupUtils.titleRegex, `\n# ${newTitle}\n`)
        await this.fsUtils.writeFile(this.hardConfig.readmeFilePath, newReadmeContent)
      }
    }
  }

  public async CheckIfStepOrInitialNumberHaveChanged() {
    const { lastConfigObj, actualConfigObj } = await this.getLastAndActualConfigObjects()

    const table = tableize('Old', 'New')

    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => {
          return previous || current.substring(0, 9) === 'numbering'
        }, false)
      ) {
        const numberingType = d.path && d.path[0]
        const oldNumbering = d.lhs
        const newNumbering = d.rhs
        table.accumulator(`${numberingType}: ${oldNumbering}`, newNumbering.toString())
      }
    })

    table.show('Config file has changes.  Run `reorder` or `build` command with `--compact` flag to rename files with new scheme.')
  }
  //#endregion

  //All Git shared operations
  // public async CommitToGit(message: string, toStageFiles?: string[], forDeletes = false) {
  //   toStageFiles = toStageFiles || (await this.GetGitListOfStageableFiles())
  //   if (toStageFiles.length > 0 || forDeletes) {
  //     // try {
  //     cli.action.start('Saving file(s) in repository'.actionStartColor())

  //     await this.processChapterFilesBeforeSaving(toStageFiles)
  //     debug(`after processing file`)

  //     if (!forDeletes) {
  //       await this.git.add(toStageFiles)
  //     }
  //     debug(`after adding files`)
  //     await this.git.addConfig('user.name', this.softConfig.config.projectAuthor.name)
  //     await this.git.addConfig('user.email', this.softConfig.config.projectAuthor.email)

  //     const commitSummary = await this.git.commit(message)
  //     const hasRemote: boolean = await this.git.getRemotes(false).then(result => {
  //       return result.find(value => value.name === 'origin') !== undefined
  //     })
  //     if (hasRemote) {
  //       await this.git.push()
  //       await this.git.pull()
  //     }

  //     const toStagePretty = toStageFiles.map(f => `\n    ${f}`.infoColor())
  //     cli.action.stop(
  //       `\nCommited and pushed ${commitSummary.commit.resultHighlighColor()}:\n${message.infoColor()}\nFile${
  //         toStageFiles.length > 1 ? 's' : ''
  //       }:${toStagePretty}`.actionStopColor()
  //     )
  //     // } catch (err) {
  //     //   this.error(err.toString().errorColor())
  //     // }
  //   }
  // }

  // public async GetGitListOfStageableFiles(chapterId?: ChapterId): Promise<string[]> {
  //   const gitStatus = await this.git.status()

  //   const unQuote = function(value: string) {
  //     if (!value) {
  //       return value
  //     }
  //     return value.replace(/"(.*)"/, '$1')
  //   }

  //   const onlyUnique = function(value: any, index: number, self: any) {
  //     return self.indexOf(value) === index
  //   }

  //   const unfilteredFileList = (await this.git.diff(['--name-only']))
  //     .split('\n')
  //     // .concat(gitStatus.deleted.map(unQuote)) //If they are removed by git.rm it is not necessary to "readd" then
  //     .concat(gitStatus.modified.map(unQuote))
  //     // .concat(gitStatus.created.map(unQuote)) //They are added manually through Add and Track command
  //     .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
  //     .filter(onlyUnique)

  //   // debug(`unfilteredFileList=${JSON.stringify(unfilteredFileList)}`)

  //   return unfilteredFileList
  //     .filter(val => val !== '')
  //     .filter(val => {
  //       return chapterId
  //         ? minimatch(val, this.softConfig.chapterWildcardWithNumber(chapterId)) ||
  //             minimatch(val, this.softConfig.metadataWildcardWithNumber(chapterId)) ||
  //             minimatch(val, this.softConfig.summaryWildcardWithNumber(chapterId))
  //         : true
  //     })
  // }

  //Project file updates
  public async addDigitsToNecessaryStacks(): Promise<boolean> {
    let didAddDigits = false
    await this.statistics.getAllNovelFiles(true)
    for (const b of [true, false]) {
      const maxDigits = this.statistics.getMaxNecessaryDigits(b)
      const minDigits = this.statistics.getMinDigits(b)
      if (minDigits < maxDigits) {
        didAddDigits = didAddDigits || (await this.addDigitsToFiles(await this.statistics.getAllFilesForOneType(b, true), maxDigits, b))
      }
    }
    return didAddDigits
  }

  public async compactFileNumbers(): Promise<void> {
    cli.action.start('Compacting file numbers'.actionStartColor())

    const table = tableize('from', 'to')
    const moves: { fromFilename: string; toFilename: string }[] = []
    const movePromises: Promise<MoveSummary>[] = []
    const { tempDir, removeTempDir } = await this.fsUtils.getTempDir(this.rootPath)
    const tempDirForGit = this.softConfig.mapFileToBeRelativeToRootPath(tempDir)

    for (const b of [true, false]) {
      const wildcards = [this.softConfig.chapterWildcard(b), this.softConfig.metadataWildcard(b), this.softConfig.summaryWildcard(b)]
      for (const wildcard of wildcards) {
        const files = await this.fsUtils.listFiles(path.join(this.rootPath, wildcard))

        const organizedFiles: any[] = []
        for (const file of files) {
          organizedFiles.push({ number: this.softConfig.extractNumber(file), filename: file })
        }

        const destDigits = this.statistics.getMaxNecessaryDigits(b)
        let currentNumber = this.softConfig.config.numberingInitial

        for (const file of organizedFiles.sort((a, b) => a.number - b.number)) {
          const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(file.filename)
          const toFilename = this.softConfig.renumberedFilename(fromFilename, currentNumber, destDigits, b)

          if (fromFilename !== toFilename) {
            moves.push({ fromFilename, toFilename })
            table.accumulator(fromFilename, toFilename)
            movePromises.push(this.gitUtils.mv(fromFilename, path.join(tempDirForGit, toFilename)))
          }
          currentNumber += this.softConfig.config.numberingStep
        }
      }
    }

    await Promise.all(movePromises)
    for (const renumbering of moves) {
      movePromises.push(this.gitUtils.mv(path.join(tempDirForGit, renumbering.toFilename), renumbering.toFilename))
    }
    await Promise.all(movePromises)

    await removeTempDir()

    if (moves.length === 0) {
      cli.action.stop(`no compacting was needed`.actionStopColor())
    } else {
      await this.addDigitsToNecessaryStacks()
      cli.action.stop(`done:`.actionStopColor())
      table.show()
    }
  }

  // public isEndOfStack(value: string): boolean {
  //   const re = new RegExp(/^@?end$/)
  //   return re.test(value)
  // }

  //private functions
  private async getLastAndActualConfigObjects(): Promise<{ lastConfigObj: any; actualConfigObj: any }> {
    if (!this._lastConfigObj || !this._actualConfigObj) {
      const configFilePath = this.softConfig.configFilePath
      // this.softConfig.configStyle === 'JSON5'
      //   ? this.hardConfig.configJSON5FilePath
      //   : this.softConfig.configStyle === 'YAML'
      //   ? this.hardConfig.configYAMLFilePath
      //   : ''
      const lastConfigContent = (await this.gitUtils.showHeadVersionOfFile(configFilePath)) || '{}'
      // (await this.git.show([`HEAD:${this.softConfig.mapFileToBeRelativeToRootPath(configFilePath).replace(/\\/, '/')}`])) || '{}'

      const actualConfigContent = await this.fsUtils.readFileContent(configFilePath)

      this._lastConfigObj = this.softConfig.parsePerStyle(lastConfigContent)
      // this.softConfig.configStyle === 'JSON5' ? jsonComment.parse(lastConfigContent, undefined, true) : yaml.safeLoad(lastConfigContent)
      this._actualConfigObj = this.softConfig.parsePerStyle(actualConfigContent)
      // this.softConfig.configStyle === 'JSON5'
      //   ? jsonComment.parse(actualConfigContent, undefined, true)
      //   : yaml.safeLoad(actualConfigContent)
    }

    return { lastConfigObj: this._lastConfigObj, actualConfigObj: this._actualConfigObj }
  }

  private async addDigitsToFiles(files: string[], newDigitNumber: number, atNumberingStack: boolean): Promise<boolean> {
    const promises: Promise<MoveSummary>[] = []
    let hasMadeChanges = false
    const table = tableize('from', 'to')

    for (const file of files) {
      const filename = this.softConfig.mapFileToBeRelativeToRootPath(file)
      const atNumbering = this.softConfig.isAtNumbering(filename)

      if (atNumbering === atNumberingStack) {
        const filenumber = this.softConfig.extractNumber(file)
        const fromFilename = filename
        const toFilename = this.softConfig.renumberedFilename(filename, filenumber, newDigitNumber, atNumbering)

        if (fromFilename !== toFilename) {
          await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, toFilename))
          table.accumulator(fromFilename, toFilename)
          promises.push(this.gitUtils.mv(fromFilename, toFilename))
          hasMadeChanges = true
        }
      }
    }

    await Promise.all(promises)
    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)

    table.show('Adding digits to files')
    return hasMadeChanges
  }
}
