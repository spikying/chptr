import { cli } from 'cli-ux'
import * as jsonComment from 'comment-json'
import { observableDiff } from 'deep-diff'
import yaml = require('js-yaml')
import * as minimatch from 'minimatch'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

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

  static flags = {
    ...Command.flags
  }
  // TODO: put --compact flag here? it's in build, delete and reorder now.

  private _softConfig: SoftConfig | undefined
  private _statistics: Statistics | undefined
  private _markupUtils: MarkupUtils | undefined

  private _lastConfigObj: any
  private _actualConfigObj: any

  async init() {
    debug('init of initialized-base')
    await super.init()

    // const { flags } = this.parse(this.constructor as any)
    // const dir = path.join(flags.path as string)
    this._softConfig = new SoftConfig(this.rootPath)
    this._statistics = new Statistics(this.softConfig, this.rootPath)
    this._markupUtils = new MarkupUtils(this.softConfig, this.rootPath)

    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) {
      throw new Error('Directory is not a repository')
    }

    const hasConfigFolder = await this.fsUtils.fileExists(this.hardConfig.configPath)
    const hasConfigJSON5File = await this.fsUtils.fileExists(this.hardConfig.configJSON5FilePath)
    const hasConfigYAMLFile = await this.fsUtils.fileExists(this.hardConfig.configYAMLFilePath)

    if (!hasConfigFolder || !(hasConfigJSON5File || hasConfigYAMLFile)) {
      throw new Error('Directory was not initialized.  Run `init` command.')
    }

    await this.RenameFilesIfNewPattern()
    await this.MoveToNewBuildDirectory()
    await this.RenameProjectTitle()
    await this.CheckIfStepOrInitialNumberHaveChanged()

    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)
  }

  public async finally() {
    await super.finally()
    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)
  }

  //All config watches
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
        const num = rootedFile.replace(isAtNumber ? reAtNumber : reNormal, '$1')

        const nameMatch = (isAtNumber ? reAtNumber : reNormal).exec(rootedFile)
        debug(`nameMatch=${JSON.stringify(nameMatch)} nameMatch.length=${nameMatch && nameMatch.length}`)
        debug(`$2=${nameMatch && nameMatch.length >= 3 ? nameMatch[2] : '---'}`)
        const name: string =
          nameMatch && nameMatch.length >= 3
            ? nameMatch[2]
            : await this.softConfig.getTitleOfChapterFromOldChapterFilename(oldChapterPattern, parseInt(num, 10), isAtNumber)
        debug(`file=${file} num=${num} name=${name}`)

        const renamedFile = oldAndNew.newPattern.replace(/NUM/g, (isAtNumber ? '@' : '') + num).replace(/NAME/g, name)

        await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, renamedFile))

        movesToExecute.push({ originalFile: rootedFile, renamedFile })
      }
    }
    for (const moveToExec of movesToExecute) {
      result = true
      movePromises.push(this.git.mv(moveToExec.originalFile, moveToExec.renamedFile))
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
      const files = await this.fsUtils.globPromise(path.join(this.rootPath, oldDir, '**/*.*'))
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

  //All Project Files manipulations
  public processContent(initialContent: string): string {
    let paraCounter = 1
    // \u2028 = line sep  \u200D = zero width joiner
    const replacedContent = initialContent
      .replace(/([.!?…}"]) {2}([{A-ZÀ-Ú])/gm, '$1' + this.markupUtils.sentenceBreakChar + '\n$2')
      .replace(/([.!?…}"])\n{2}([{A-ZÀ-Ú])/gm, (_full, one, two) => {
        paraCounter++
        return `${one}\n\n${this.markupUtils.paragraphBreakChar}{{${paraCounter}}}\n${two}`
      })

    return replacedContent
  }

  public processContentBack(initialContent: string): string {
    const sentenceBreakRegex = new RegExp(this.markupUtils.sentenceBreakChar + '\\n', 'g')
    const paragraphBreakRegex = new RegExp('\\n\\n' + this.markupUtils.paragraphBreakChar + '{{\\d+}}\\n', 'g')

    const replacedContent = initialContent
      .replace(sentenceBreakRegex, '  ')
      .replace(paragraphBreakRegex, '\n\n')
      .replace(/([.!?…}"]) +\n/g, '$1\n')
      .replace(/\n*$/, '\n')

    return replacedContent
  }

  public async processChapterFilesBeforeSaving(toStageFiles: string[]): Promise<void> {
    for (const filename of toStageFiles) {
      const fullPath = path.join(this.rootPath, filename)
      const exists = await this.fsUtils.fileExists(fullPath)
      debug(`file exists = ${exists}`)
      if (
        exists &&
        (this.softConfig.chapterRegex(false).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.softConfig.chapterRegex(true).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)))
      ) {
        try {
          const initialContent = await this.fsUtils.readFileContent(fullPath)
          const replacedContent = this.processContent(this.processContentBack(initialContent))
          await this.fsUtils.writeFile(fullPath, replacedContent)
        } catch (err) {
          this.error(err.toString().errorColor())
          this.exit(1)
        }
      }
    }
  }

  //All Git shared operations
  public async CommitToGit(message: string, toStageFiles?: string[], forDeletes = false) {
    toStageFiles = toStageFiles || (await this.GetGitListOfStageableFiles())
    if (toStageFiles.length > 0 || forDeletes) {
      try {
        cli.action.start('Saving file(s) in repository'.actionStartColor())

        await this.processChapterFilesBeforeSaving(toStageFiles)
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
      } catch (err) {
        this.error(err.toString().errorColor())
      }
    }
  }

  public async GetGitListOfStageableFiles(numberFilter?: number, atFilter?: boolean): Promise<string[]> {
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
        return numberFilter
          ? minimatch(val, this.softConfig.chapterWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.softConfig.metadataWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.softConfig.summaryWildcardWithNumber(numberFilter, atFilter || false))
          : true
      })
  }

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
        const files = await this.fsUtils.globPromise(path.join(this.rootPath, wildcard))

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
            movePromises.push(this.git.mv(fromFilename, path.join(tempDirForGit, toFilename)))
          }
          currentNumber += this.softConfig.config.numberingStep
        }
      }
    }

    await Promise.all(movePromises)
    for (const renumbering of moves) {
      movePromises.push(this.git.mv(path.join(tempDirForGit, renumbering.toFilename), renumbering.toFilename))
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

  public isEndOfStack(value: string): boolean {
    const re = new RegExp(/^@?end$/)
    return re.test(value)
  }

  public async reorder(origin: string, destination: string): Promise<void> {
    if (!origin) {
      throw new Error('You need to provide an origin chapter')
    }
    if (!destination) {
      throw new Error('You need to provide a destination chapter')
    }

    const originIsAtNumbering = origin.toString().substring(0, 1) === '@'
    const destIsAtNumbering = destination.toString().substring(0, 1) === '@'

    const files = await this.statistics.getAllNovelFiles()

    const originNumber: number = this.isEndOfStack(origin)
      ? this.statistics.getHighestNumber(originIsAtNumbering)
      : this.softConfig.extractNumber(origin)
    const destNumber: number = this.isEndOfStack(destination)
      ? this.statistics.getHighestNumber(destIsAtNumbering) === 0
        ? this.softConfig.config.numberingInitial
        : this.statistics.getHighestNumber(destIsAtNumbering) + this.softConfig.config.numberingStep
      : this.softConfig.extractNumber(destination)

    const originExists: boolean = files
      .map(value => {
        return this.softConfig.extractNumber(value) === originNumber && this.softConfig.isAtNumbering(value) === originIsAtNumbering
      })
      .reduce((previous, current) => {
        return previous || current
      }, false)
    if (!originExists) {
      this.error('Origin does not exist'.errorColor())
      this.exit(1)
    }

    if (originNumber === -1) {
      this.error('Origin argument is not a number or `end` or `@end`'.errorColor())
      this.exit(1)
    }
    if (destNumber === -1) {
      this.error('Destination argument is not a number or `end` or `@end`'.errorColor())
      this.exit(1)
    }
    if (destNumber === originNumber && originIsAtNumbering === destIsAtNumbering) {
      this.error('Origin must be different than Destination'.errorColor())
      this.exit(1)
    }

    const sameAtNumbering = originIsAtNumbering === destIsAtNumbering
    const forwardBump: boolean = sameAtNumbering ? destNumber < originNumber : true

    const fileInfoArray = [
      ...new Set(
        (await this.statistics.getAllFilesForOneType(destIsAtNumbering)).map(file => {
          return this.softConfig.extractNumber(file)
        })
      )
    ] //to make unique
      .filter(fileNumber => {
        if (sameAtNumbering) {
          if (fileNumber < Math.min(originNumber, destNumber) || fileNumber > Math.max(originNumber, destNumber) || fileNumber < 0) {
            return false
          } else {
            return true
          }
        } else {
          return fileNumber >= destNumber
        }
      })
      .map(fileNumber => {
        let newFileNumber: number
        let mandatory = false
        if (fileNumber === originNumber && sameAtNumbering) {
          newFileNumber = destNumber
          mandatory = true
        } else {
          if (forwardBump) {
            newFileNumber = fileNumber + 1
          } else {
            newFileNumber = fileNumber - 1
          }
        }
        return { fileNumber, newFileNumber, mandatory }
      })

    let currentMandatory = sameAtNumbering
      ? fileInfoArray.filter(f => f.mandatory)[0]
      : { fileNumber: null, newFileNumber: destNumber, mandatory: true }
    const allMandatories = [currentMandatory]
    while (currentMandatory) {
      let nextMandatory = fileInfoArray.filter(f => !f.mandatory && f.fileNumber === currentMandatory.newFileNumber)[0]
      if (nextMandatory) {
        allMandatories.push(nextMandatory)
      }
      currentMandatory = nextMandatory
    }

    const toMoveFiles = fileInfoArray.filter(info => {
      return allMandatories.map(m => m.fileNumber).includes(info.fileNumber)
    })

    const toRenameFiles = (await this.statistics.getAllFilesForOneType(destIsAtNumbering))
      .filter(file => {
        const fileNumber = this.softConfig.extractNumber(file)
        return toMoveFiles.map(m => m.fileNumber).includes(fileNumber)
      })
      .map(file => {
        const fileNumber = this.softConfig.extractNumber(file)
        const mf = toMoveFiles.filter(m => m.fileNumber === fileNumber)[0]
        return { file, newFileNumber: mf.newFileNumber }
      })

    if (!sameAtNumbering) {
      const originFiles = (await this.statistics.getAllFilesForOneType(originIsAtNumbering)).filter(file => {
        return this.softConfig.extractNumber(file) === originNumber
      })

      for (const f of originFiles) {
        toRenameFiles.push({ file: f, newFileNumber: destNumber })
      }
    }

    cli.action.stop('done'.actionStopColor())
    cli.action.start('Moving files to temp directory'.actionStartColor())

    const { tempDir } = await this.fsUtils.getTempDir(this.rootPath)

    try {
      const moveTempPromises: Promise<MoveSummary>[] = []
      for (const file of toRenameFiles.map(f => f.file)) {
        const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(file)
        const toFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, fromFilename))
        debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)

        await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, toFilename))

        moveTempPromises.push(this.git.mv(fromFilename, toFilename))
      }
      await Promise.all(moveTempPromises)

      cli.action.stop(tempDir.actionStopColor())
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    cli.action.start('Moving files to their final states'.actionStartColor())
    let fileMovesPretty = ''

    try {
      const moveBackPromises: Promise<MoveSummary>[] = []
      for (const moveItem of toRenameFiles) {
        const filename = this.softConfig.mapFileToBeRelativeToRootPath(moveItem.file)
        const newFileNumber: number = moveItem.newFileNumber
        const destDigits = this.statistics.getMaxNecessaryDigits(destIsAtNumbering)

        const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, filename))
        const toFilename = this.softConfig.renumberedFilename(filename, newFileNumber, destDigits, destIsAtNumbering)

        await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, toFilename))

        debug(`TEMPed file: ${fromFilename} BACK TO ${toFilename}`)

        fileMovesPretty.concat(`\n    renaming from "${fromFilename}" to "${toFilename}"`)
        moveBackPromises.push(this.git.mv(fromFilename, toFilename))
      }
      await Promise.all(moveBackPromises)
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)

    cli.action.stop('done'.actionStopColor())
  }

  //private functions
  private async getLastAndActualConfigObjects(): Promise<{ lastConfigObj: any; actualConfigObj: any }> {
    if (!this._lastConfigObj || !this._actualConfigObj) {
      const configFilePath =
        this.softConfig.configStyle === 'JSON5'
          ? this.hardConfig.configJSON5FilePath
          : this.softConfig.configStyle === 'YAML'
          ? this.hardConfig.configYAMLFilePath
          : ''
      const lastConfigContent =
        (await this.git.show([`HEAD:${this.softConfig.mapFileToBeRelativeToRootPath(configFilePath).replace(/\\/, '/')}`])) || '{}'

      const actualConfigContent = await this.fsUtils.readFileContent(configFilePath)

      this._lastConfigObj =
        this.softConfig.configStyle === 'JSON5' ? jsonComment.parse(lastConfigContent, undefined, true) : yaml.safeLoad(lastConfigContent)
      this._actualConfigObj =
        this.softConfig.configStyle === 'JSON5'
          ? jsonComment.parse(actualConfigContent, undefined, true)
          : yaml.safeLoad(actualConfigContent)
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
          promises.push(this.git.mv(fromFilename, toFilename))
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
