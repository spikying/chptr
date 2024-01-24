import { observableDiff } from 'deep-diff'
import { tableize } from './ui-utils'
import { Inject, InjectValue } from 'typescript-ioc'
import { SoftConfig } from './soft-config'
import { GitUtils } from './git-utils'
import { FsUtils } from './fs-utils'
import { glob } from 'glob'
import path = require('path')
import { ChapterId } from './chapter-id'
import { MarkupUtils } from './markup-utils'
import { HardConfig } from './hard-config'

const debug = require('debug')('WatchConfig')

export default class WatchConfig {
  private readonly softConfig: SoftConfig
  private readonly gitUtils: GitUtils
  private readonly fsUtils: FsUtils
  private readonly hardConfig: HardConfig
  private readonly markupUtils: MarkupUtils
  private readonly rootPath: string

  private _lastConfigObj: any
  private _actualConfigObj: any

  constructor(
    @Inject softConfig: SoftConfig,
    @Inject gitUtils: GitUtils,
    @Inject fsUtils: FsUtils,
    @Inject hardConfig: HardConfig,
    @Inject markupUtils: MarkupUtils,
    @InjectValue('rootPath') rootPath: string
  ) {
    this.softConfig = softConfig
    this.gitUtils = gitUtils
    this.fsUtils = fsUtils
    this.hardConfig = hardConfig
    this.markupUtils = markupUtils
    this.rootPath = rootPath
  }

  public async CheckIfStepOrInitialNumberHaveChanged() {
    const { actualConfigObj, lastConfigObj } = await this.getLastAndActualConfigObjects()

    const table = tableize('Old', 'New')

    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => previous || (typeof current === 'string' && current.slice(0, 9) === 'numbering'), false)
      ) {
        const numberingType = d.path && d.path[0]
        const oldNumbering = d.lhs
        const newNumbering = d.rhs
        table.accumulator(`${numberingType}: ${oldNumbering}`, newNumbering.toString())
      }
    })

    table.show('Config file has changes.  Run `reorder` or `build` command with `--compact` flag to rename files with new scheme.')
  }

  private async getLastAndActualConfigObjects(): Promise<{ actualConfigObj: any; lastConfigObj: any }> {
    if (!this._lastConfigObj || !this._actualConfigObj) {
      const { configFilePath } = this.softConfig
      const lastConfigContent = (await this.gitUtils.showHeadVersionOfFile(configFilePath)) || '{}'
      const actualConfigContent = await this.fsUtils.readFileContent(configFilePath)

      this._lastConfigObj = this.softConfig.parsePerStyle(lastConfigContent)
      this._actualConfigObj = this.softConfig.parsePerStyle(actualConfigContent)
    }

    return { actualConfigObj: this._actualConfigObj, lastConfigObj: this._lastConfigObj }
  }

  public async MoveToNewBuildDirectory(): Promise<void> {
    const { actualConfigObj, lastConfigObj } = await this.getLastAndActualConfigObjects()

    let oldDir = ''
    let newDir = ''

    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (d.kind === 'E' && d.path && d.path.reduce((previous, current) => previous || current === 'buildDirectory', false)) {
        oldDir = d.lhs
        newDir = this.fsUtils.sanitizeFileName(d.rhs, true)
      }
    })

    if (oldDir !== newDir) {
      const files = await glob(path.join(this.rootPath, oldDir, '**/*.*'))
      debug(`move to new build dir : files=${files}`)
      await this.fsUtils.createSubDirectoryFromDirectoryPathIfNecessary(path.join(this.rootPath, newDir))

      for (const file of files) {
        const newFile = path.relative(path.join(this.rootPath, oldDir), file)
        await this.fsUtils.moveFile(file, path.join(this.rootPath, newDir, newFile))
      }

      const gitIgnoreContent = await this.fsUtils.readFileContent(this.hardConfig.gitignoreFilePath)
      const newGitIgnoreContent = gitIgnoreContent.replace(oldDir, newDir.replaceAll('\\', '/'))
      await this.fsUtils.writeFile(this.hardConfig.gitignoreFilePath, newGitIgnoreContent)
    }
  }

  public async RenameFilesIfNewPattern(): Promise<boolean> {
    let result = false
    const { actualConfigObj, lastConfigObj } = await this.getLastAndActualConfigObjects()

    const oldVsNew: {
      newPattern: string
      // needsName: boolean;
      oldPattern: string
    }[] = []
    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => previous || (typeof current === 'string' && current.indexOf('Pattern') > 0), false)
      ) {
        const fileType = d.path && d.path[0]
        const oldPattern = d.lhs.replace('.<ext>', `.${this.softConfig.configStyle.toLowerCase()}`)
        const newPattern = this.fsUtils.sanitizeFileName(d.rhs.replace('.<ext>', `.${this.softConfig.configStyle.toLowerCase()}`), true)
        // const needsName = oldPattern.indexOf('NAME') === -1
        debug(`fileType=${fileType}, oldPattern=${oldPattern}, newPattern=${newPattern}`)
        oldVsNew.push({
          newPattern,
          // needsName,
          oldPattern
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
        const currentId = new ChapterId(Number.parseInt(numAsString, 10), isAtNumber)

        const nameMatch = (currentId.isAtNumber ? reAtNumber : reNormal).exec(rootedFile)
        debug(`nameMatch=${JSON.stringify(nameMatch)} nameMatch.length=${nameMatch && nameMatch.length}`)
        debug(`$2=${nameMatch && nameMatch.length >= 3 ? nameMatch[2] : '---'}`)
        const name: string =
          nameMatch && nameMatch.length >= 3
            ? nameMatch[2]
            : await this.softConfig.getTitleOfChapterFromOldChapterFilename(oldChapterPattern, currentId)
        debug(`file=${file} num=${numAsString} name=${name}`)

        const renamedFile = oldAndNew.newPattern.replaceAll('NUM', (currentId.isAtNumber ? '@' : '') + numAsString).replaceAll('NAME', name)

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

  public async RenameProjectTitle() {
    const { actualConfigObj, lastConfigObj } = await this.getLastAndActualConfigObjects()

    let oldTitle = ''
    let newTitle = ''

    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (d.kind === 'E' && d.path && d.path.reduce((previous, current) => previous || current === 'projectTitle', false)) {
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
}
