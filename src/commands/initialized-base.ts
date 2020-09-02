import { observableDiff } from 'deep-diff'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

import { BootstrapChptr } from '../bootstrap-functions'
import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { CoreUtils } from '../core-utils'
import { GitUtils } from '../git-utils'
import { MarkupUtils } from '../markup-utils'
import { SoftConfig } from '../soft-config'
import { Statistics } from '../statistics'
import { tableize } from '../ui-utils'

import Command, { d } from './base'
import { FsUtils } from '../fs-utils'
import { Container, Scope, ObjectFactory } from 'typescript-ioc'

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
    const bootstrapper = new BootstrapChptr(this.rootPath)
    const isChptrFolder = await bootstrapper.isChptrFolder()
    // const git = simplegit(this.rootPath)
    // const isRepo = await git.checkIsRepo()
    // const hasConfigFolder = await this.fsUtils.fileExists(this.hardConfig.configPath)
    // const hasConfigJSON5File = await this.fsUtils.fileExists(this.hardConfig.configJSON5FilePath)
    // const hasConfigYAMLFile = await this.fsUtils.fileExists(this.hardConfig.configYAMLFilePath)

    // if (!isRepo || !hasConfigFolder || !(hasConfigJSON5File || hasConfigYAMLFile)) {
    if (!isChptrFolder) {
      throw new ChptrError('Directory was not initialized.  Run `init` command.', 'initialized-base.init', 9)
    }
    //#endregion

    //#region bootstrap all configs and utils
    const softConfigFactory: ObjectFactory = () => {
      return new SoftConfig(this.rootPath)
    }

    Container.bind(SoftConfig).factory(softConfigFactory).scope(Scope.Singleton)

    // const _singleGitUtils = new GitUtils(this.softConfig, this.rootPath)
    const gitUtilsFactory: ObjectFactory = () => {
      return new GitUtils(this.softConfig, this.rootPath)
    }

    Container.bind(GitUtils).factory(gitUtilsFactory).scope(Scope.Singleton)

    const statisticsFactory: ObjectFactory = () => {
      return new Statistics(this.softConfig, this.rootPath)
    }

    Container.bind(Statistics).factory(statisticsFactory).scope(Scope.Singleton)

    const markupUtilsFactory: ObjectFactory = () => {
      return new MarkupUtils(this.softConfig, this.rootPath)
    }

    Container.bind(MarkupUtils).factory(markupUtilsFactory).scope(Scope.Singleton)

    this._softConfig = Container.get(SoftConfig) //new SoftConfig(this.rootPath)
    this._statistics = Container.get(Statistics) // new Statistics(this.softConfig, this.rootPath)
    this._markupUtils = Container.get(MarkupUtils) // new MarkupUtils(this.softConfig, this.rootPath)
    this._gitUtils = Container.get(GitUtils) //new GitUtils(this.softConfig, this.rootPath)
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
    const fsu = this.fsUtils || new FsUtils()
    await fsu.deleteEmptySubDirectories(this.rootPath)
    await super.finally()
  }

  //#region config watches

  private async RenameFilesIfNewPattern(): Promise<boolean> {
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
          return previous || (typeof current === 'string' && current.indexOf('Pattern') > 0)
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

    // debug(`old vs new: ${JSON.stringify(oldVsNew)}`)

    const oldChapterPattern = lastConfigObj.chapterPattern

    // const movePromises: Promise<MoveSummary>[] = []
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
      // movePromises.push(this.gitUtils.mv(moveToExec.originalFile, moveToExec.renamedFile))
      await this.gitUtils.mv(moveToExec.originalFile, moveToExec.renamedFile)
    }

    // await Promise.all(movePromises)
    return result
  }

  private async MoveToNewBuildDirectory(): Promise<void> {
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

  private async RenameProjectTitle() {
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

  private async CheckIfStepOrInitialNumberHaveChanged() {
    const { lastConfigObj, actualConfigObj } = await this.getLastAndActualConfigObjects()

    const table = tableize('Old', 'New')

    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => {
          return previous || (typeof current === 'string' && current.substring(0, 9) === 'numbering')
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

  //#endregion
}
