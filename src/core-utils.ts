import { cli } from 'cli-ux'
import * as d from 'debug'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

import { ChapterId } from './chapter-id'
import { ChptrError } from './chptr-error'
import { FsUtils } from './fs-utils'
import { GitUtils } from './git-utils'
import { HardConfig } from './hard-config'
import { MarkupUtils } from './markup-utils'
import { SoftConfig } from './soft-config'
import { Statistics } from './statistics'
import { QueryBuilder, tableize } from './ui-utils'

const debug = d('core-utils')

// TODO: implement IoC (DI) with https://www.npmjs.com/package/typescript-ioc
export class CoreUtils {
  private readonly softConfig: SoftConfig
  private readonly hardConfig: HardConfig
  private readonly rootPath: string
  private readonly markupUtils: MarkupUtils
  private readonly fsUtils: FsUtils
  private readonly statistics: Statistics
  private readonly gitUtils: GitUtils

  constructor(softConfig: SoftConfig, rootPath: string) {
    this.softConfig = softConfig
    this.hardConfig = new HardConfig(rootPath)
    this.rootPath = rootPath
    this.markupUtils = new MarkupUtils(softConfig, rootPath)
    this.fsUtils = new FsUtils()
    this.statistics = new Statistics(softConfig, rootPath)
    this.gitUtils = new GitUtils(softConfig, rootPath)
  }

  //#region project files manipulations

  public processContent(initialContent: string): string {
    let paraCounter = 1
    // \u2028 = line sep  \u200D = zero width joiner
    const replacedContent = this.processContentBack(initialContent)
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
    // cli.info('Processing files to repository format:'.infoColor())
    const table = tableize('', 'file')
    for (const filename of toStageFiles) {
      const fullPath = path.join(this.rootPath, filename)
      const exists = await this.fsUtils.fileExists(fullPath)

      if (
        exists &&
        (this.softConfig.chapterRegex(false).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.softConfig.chapterRegex(true).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.softConfig.summaryRegex(false).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.softConfig.summaryRegex(true).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)))
      ) {
        const initialContent = await this.fsUtils.readFileContent(fullPath)
        const replacedContent = this.processContent(this.processContentBack(initialContent))
        if (initialContent !== replacedContent) {
          await this.fsUtils.writeFile(fullPath, replacedContent)
          table.accumulator('', fullPath)
          // cli.info(`    ${fullPath}`.resultHighlighColor())
        }
      }
    }
    table.show('Processing files to repository format')
  }

  //#end region
  //#region shared core

  public async preProcessAndCommitFiles(
    message: string,
    toStageFiles?: string[],
    forDeletes = false
  ) {
    return this.gitUtils.CommitToGit(message, this.processChapterFilesBeforeSaving.bind(this), toStageFiles, forDeletes)
  }

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

  public async deleteFilesFromRepo(nameOrNumber: string): Promise<string> {
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
      return ''
    } else {
      cli.action.start('Deleting file(s) locally and from repository'.actionStartColor())
      await this.gitUtils.rm(this.softConfig.mapFilesToBeRelativeToRootPath(toDeleteFiles))
      const toDeletePretty = toDeleteFiles.map(f => `\n    ${f}`)
      cli.action.stop(`${toDeletePretty}\nwere deleted`.actionStopColor())

      const commitMsg = `Removed files:\n    ${this.softConfig.mapFilesToBeRelativeToRootPath(toDeleteFiles).join('\n    ')}`
      return commitMsg
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

      moveTempPromises.push(this.gitUtils.mv(fromFilename, toFilename))
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
      moveBackPromises.push(this.gitUtils.mv(fromFilename, toFilename))
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
}
