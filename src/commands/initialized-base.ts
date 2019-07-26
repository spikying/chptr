import { cli } from 'cli-ux'
import { observableDiff } from 'deep-diff'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { CoreUtils } from '../core-utils'
import { GitWrapper } from '../git-wrapper'
import { MarkupUtils } from '../markup-utils'
import { SoftConfig } from '../soft-config'
import { Statistics } from '../statistics'
import { QueryBuilder, tableize } from '../ui-utils'

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
  public get gitWrapper(): GitWrapper {
    return this._gitWrapper as GitWrapper
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
  private _gitWrapper: GitWrapper | undefined
  private _coreUtils: CoreUtils | undefined

  private _lastConfigObj: any
  private _actualConfigObj: any

  async init() {
    debug('init of initialized-base')
    await super.init()

    const isRepo = await this.git.checkIsRepo()
    const hasConfigFolder = await this.fsUtils.fileExists(this.hardConfig.configPath)
    const hasConfigJSON5File = await this.fsUtils.fileExists(this.hardConfig.configJSON5FilePath)
    const hasConfigYAMLFile = await this.fsUtils.fileExists(this.hardConfig.configYAMLFilePath)

    if (!isRepo || !hasConfigFolder || !(hasConfigJSON5File || hasConfigYAMLFile)) {
      throw new ChptrError('Directory was not initialized.  Run `init` command.', 'initialized-base.init', 9)
    }

    // const { flags } = this.parse(this.constructor as any)
    // const dir = path.join(flags.path as string)
    this._softConfig = new SoftConfig(this.rootPath)
    this._statistics = new Statistics(this.softConfig, this.rootPath)
    this._markupUtils = new MarkupUtils(this.softConfig, this.rootPath)
    this._gitWrapper = new GitWrapper(this.softConfig, this.rootPath)
    this._coreUtils = new CoreUtils(this.softConfig, this.rootPath)

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

  //#region shared core
  public async addChapterFiles(name: string, atNumbering: boolean, number?: string) {
    let chapterId: ChapterId
    if (number) {
      chapterId = new ChapterId(this.softConfig.extractNumber(number), this.softConfig.isAtNumbering(number))

      const existingFile = await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId)))

      if (existingFile.length > 0) {
        throw new ChptrError(`File ${existingFile[0]} already exists`, 'add.addchapterfiles', 1)
      }
    } else {
      await this.statistics.updateStackStatistics(atNumbering)

      const highestNumber = this.statistics.getHighestNumber(atNumbering)
      chapterId = new ChapterId(
        highestNumber === 0 ? this.softConfig.config.numberingInitial : highestNumber + this.softConfig.config.numberingStep,
        atNumbering
      )
    }

    const emptyFileString = this.softConfig.emptyFileString.toString()
    const filledTemplateData = emptyFileString.replace(/{TITLE}/gim, name)
    const metadataObj: any = this.softConfig.config.metadataFields
    metadataObj.computed.title = name
    metadataObj.computed.wordCount = this.markupUtils.GetWordCount(filledTemplateData)
    const filledTemplateMeta = this.softConfig.stringifyPerStyle(metadataObj)
    // this.softConfig.configStyle === 'JSON5'
    //   ? JSON.stringify(metadataObj, undefined, 4)
    //   : this.softConfig.configStyle === 'YAML'
    //     ? yaml.safeDump(metadataObj)
    //     : ''

    const fullPathsAndData = [
      {
        path: path.join(this.rootPath, this.softConfig.chapterFileNameFromParameters(chapterId, name)),
        data: filledTemplateData
      },
      {
        path: path.join(this.rootPath, this.softConfig.metadataFileNameFromParameters(chapterId, name)),
        data: filledTemplateMeta
      },
      {
        path: path.join(this.rootPath, this.softConfig.summaryFileNameFromParameters(chapterId, name)),
        data: filledTemplateData
      }
    ]

    cli.action.start('Creating file(s) locally and to repository'.actionStartColor())

    const allPromises: Promise<void>[] = []
    for (const pathAndData of fullPathsAndData) {
      allPromises.push(this.fsUtils.createFile(pathAndData.path, pathAndData.data))
    }
    await Promise.all(allPromises)
    cli.action.stop(
      '\n    ' +
        fullPathsAndData
          .map(pad => pad.path)
          .join('\n    ')
          .actionStopColor()
    )

    return this.softConfig.mapFilesToBeRelativeToRootPath(fullPathsAndData.map(pad => pad.path))
  }

  public async deleteFilesFromRepo(nameOrNumber: string) {
    const toDeleteFiles: string[] = []

    const numberRegexWithoutAtNumbering = new RegExp('^' + this.softConfig.numbersPattern(false) + '$')
    const numberRegexWithAtNumbering = new RegExp('^' + this.softConfig.numbersPattern(true) + '$')

    const isChapterNumberOnly = numberRegexWithoutAtNumbering.test(nameOrNumber) || numberRegexWithAtNumbering.test(nameOrNumber)

    if (!isChapterNumberOnly) {
      // we will delete all files matching the name entered
      let filePattern = '**/' + nameOrNumber

      const pathName = path.join(this.rootPath, filePattern)
      toDeleteFiles.push(...(await this.fsUtils.listFiles(pathName)))
    } else {
      // we will delete all files matching the number patterns for chapters, metadata and summary
      const id = new ChapterId(this.softConfig.extractNumber(nameOrNumber), this.softConfig.isAtNumbering(nameOrNumber))
      toDeleteFiles.push(...(await this.statistics.getAllFilesForChapter(id)))
    }

    if (toDeleteFiles.length === 0) {
      cli.warn('No files to delete.'.errorColor())
    } else {
      cli.action.start('Deleting file(s) locally and from repository'.actionStartColor())
      await this.git.rm(this.softConfig.mapFilesToBeRelativeToRootPath(toDeleteFiles))
      const toDeletePretty = toDeleteFiles.map(f => `\n    ${f}`)
      cli.action.stop(`${toDeletePretty}\nwere deleted`.actionStopColor())

      await this.gitWrapper.CommitToGit(
        `Removed files:\n    ${this.softConfig.mapFilesToBeRelativeToRootPath(toDeleteFiles).join('\n    ')}`,
        undefined,
        true
      )
    }
  }

  public async reorder(origin: string, destination: string): Promise<void> {
    cli.action.start('Analyzing files'.actionStartColor())

    await this.statistics.getAllNovelFiles()

    const originId = await this.checkArgPromptAndExtractChapterId(origin, 'What chapter to use as origin?')

    const destinationId = await this.checkArgPromptAndExtractChapterId(destination, 'What chapter to use as destination?', true)

    if (!originId) {
      throw new ChptrError('You need to provide a valid origin chapter', 'initialized-base.reorder.destination', 10)
    }
    if (!destinationId) {
      throw new ChptrError('You need to provide a valid destination chapter', 'initialized-base.reorder.destination', 11)
    }

    // const originIsAtNumbering = origin.toString().substring(0, 1) === '@'
    // const destIsAtNumbering = destination.toString().substring(0, 1) === '@'

    // const files = await this.statistics.getAllNovelFiles()

    // const originNumber: number = this.isEndOfStack(origin)
    //   ? this.statistics.getHighestNumber(originIsAtNumbering)
    //   : this.softConfig.extractNumber(origin)
    // const destNumber: number = this.isEndOfStack(destination)
    //   ? this.statistics.getHighestNumber(destIsAtNumbering) === 0
    //     ? this.softConfig.config.numberingInitial
    //     : this.statistics.getHighestNumber(destIsAtNumbering) + this.softConfig.config.numberingStep
    //   : this.softConfig.extractNumber(destination)

    // const originExists: boolean = files
    //   .map(value => {
    //     return this.softConfig.extractNumber(value) === originNumber && this.softConfig.isAtNumbering(value) === originIsAtNumbering
    //   })
    //   .reduce((previous, current) => {
    //     return previous || current
    //   }, false)
    // if (!originExists) {
    //   throw new ChptrError('Origin does not exist', 'initialized-base.reorder.origin', 12)
    // }

    // if (originNumber === -1) {
    //   throw new ChptrError('Origin argument is not a number or `end` or `@end`', 'initialized-base.reorder.origin', 13)
    // }
    // if (destNumber === -1) {
    //   throw new ChptrError('Destination argument is not a number or `end` or `@end`', 'initialized-base.reorder.destination', 14)
    // }

    //TODO: check if equality goes through .equals of class
    if (originId === destinationId) {
      //destNumber === originNumber && originIsAtNumbering === destIsAtNumbering
      throw new ChptrError('Origin must be different than Destination', 'initialized-base.reorder.originvsdestination', 15)
    }

    const sameAtNumbering = originId.isAtNumber === destinationId.isAtNumber
    const forwardBump: boolean = sameAtNumbering ? destinationId.num < originId.num : true

    const fileNumbersToMoveInDestStack = [
      ...new Set(
        (await this.statistics.getAllFilesForOneType(destinationId.isAtNumber)).map(file => {
          return this.softConfig.extractNumber(file)
        })
      )
    ] //to make unique
      .filter(fileNumber => {
        if (sameAtNumbering) {
          if (
            fileNumber < Math.min(originId.num, destinationId.num) ||
            fileNumber > Math.max(originId.num, destinationId.num) ||
            fileNumber < 0
          ) {
            return false
          } else {
            return true
          }
        } else {
          return fileNumber >= destinationId.num
        }
      })
      .map(fileNumber => {
        let newFileNumber: number
        let cursor = false
        if (fileNumber === originId.num && sameAtNumbering) {
          newFileNumber = destinationId.num
          cursor = true
        } else {
          if (forwardBump) {
            newFileNumber = fileNumber + 1
          } else {
            newFileNumber = fileNumber - 1
          }
        }
        return { fileNumber, newFileNumber, mandatory: cursor }
      })

    let currentCursor = sameAtNumbering
      ? fileNumbersToMoveInDestStack.filter(f => f.mandatory)[0]
      : { fileNumber: null, newFileNumber: destinationId.num, mandatory: true }
    const allCursors = [currentCursor]
    while (currentCursor) {
      let nextCursor = fileNumbersToMoveInDestStack.filter(f => !f.mandatory && f.fileNumber === currentCursor.newFileNumber)[0]
      if (nextCursor) {
        allCursors.push(nextCursor)
      }
      currentCursor = nextCursor
    }

    const toMoveFiles = fileNumbersToMoveInDestStack.filter(info => {
      return allCursors.map(cur => cur.fileNumber).includes(info.fileNumber)
    })

    const toRenameFiles = (await this.statistics.getAllFilesForOneType(destinationId.isAtNumber))
      .filter(file => {
        // const fileNumber = this.softConfig.extractNumber(file)
        return toMoveFiles.map(m => m.fileNumber).includes(this.softConfig.extractNumber(file))
      })
      .map(file => {
        const fileNumber = this.softConfig.extractNumber(file)
        const mf = toMoveFiles.filter(m => m.fileNumber === fileNumber)[0]
        return { file, newFileNumber: mf.newFileNumber }
      })

    if (!sameAtNumbering) {
      const originFiles = (await this.statistics.getAllFilesForOneType(originId.isAtNumber)).filter(file => {
        return this.softConfig.extractNumber(file) === originId.num
      })

      for (const f of originFiles) {
        toRenameFiles.push({ file: f, newFileNumber: destinationId.num })
      }
    }

    cli.action.stop(`from ${origin.toString()} to ${destinationId.toString()}`.actionStopColor())
    cli.action.start('Moving files to temp directory'.actionStartColor())

    const { tempDir } = await this.fsUtils.getTempDir(this.rootPath)

    // try {
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
    // } catch (err) {
    //   throw new ChptrError(err.toString().errorColor())
    //   cli.exit(1)
    // }

    cli.action.start('Moving files to their final states'.actionStartColor())
    let fileMovesPretty = ''

    // try {
    const moveBackPromises: Promise<MoveSummary>[] = []
    for (const moveItem of toRenameFiles) {
      const filename = this.softConfig.mapFileToBeRelativeToRootPath(moveItem.file)
      const newFileNumber: number = moveItem.newFileNumber
      const destDigits = this.statistics.getMaxNecessaryDigits(destinationId.isAtNumber)

      const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, filename))
      const toFilename = this.softConfig.renumberedFilename(filename, newFileNumber, destDigits, destinationId.isAtNumber)

      await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, toFilename))

      debug(`TEMPed file: ${fromFilename} BACK TO ${toFilename}`)

      fileMovesPretty.concat(`\n    renaming from "${fromFilename}" to "${toFilename}"`)
      moveBackPromises.push(this.git.mv(fromFilename, toFilename))
    }
    await Promise.all(moveBackPromises)
    // } catch (err) {
    //   throw new ChptrError(err.toString().errorColor())
    //   cli.exit(1)
    // }

    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)

    cli.action.stop('done'.actionStopColor())
  }
  //#endregion

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

  // public isEndOfStack(value: string): boolean {
  //   const re = new RegExp(/^@?end$/)
  //   return re.test(value)
  // }

  public async checkArgPromptAndExtractChapterId(chapterInput: string, promptMsg: string, nextId = false): Promise<ChapterId | null> {
    debug(`chapterInput = ${chapterInput}`)
    if (!chapterInput) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('chapter', queryBuilder.textinput(promptMsg, ''))
      const queryResponses: any = await queryBuilder.responses()
      chapterInput = queryResponses.chapter
    }

    const isAtNumbering = this.softConfig.isAtNumbering(chapterInput)
    debug(`isAtNumbering in checkArgsPrompt = ${isAtNumbering}`)
    let num: number
    if (this.hardConfig.isEndOfStack(chapterInput)) {
      await this.statistics.updateStackStatistics(isAtNumbering)
      if (nextId) {
        num =
          this.statistics.getHighestNumber(isAtNumbering) === 0
            ? this.softConfig.config.numberingInitial
            : this.statistics.getHighestNumber(isAtNumbering) + this.softConfig.config.numberingStep
      } else {
        num = this.statistics.getHighestNumber(isAtNumbering)
      }
    } else {
      num = this.softConfig.extractNumber(chapterInput)
    }

    const chapterId = new ChapterId(num, isAtNumbering)
    if ((await this.statistics.getAllFilesForChapter(chapterId)).length || nextId) {
      return chapterId
    } else {
      return null
      // throw new ChptrError(`Chapter id ${chapterInput} is not found on disk.`, 'initialized-base.checkpromptandextractchapterid', 30)
    }
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
      const lastConfigContent =
        (await this.git.show([`HEAD:${this.softConfig.mapFileToBeRelativeToRootPath(configFilePath).replace(/\\/, '/')}`])) || '{}'

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
