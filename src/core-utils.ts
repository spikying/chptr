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
import { Singleton, Container } from 'typescript-ioc'

import latinize = require('latinize')
import sanitize = require('sanitize-filename')

import { file as tmpFile } from 'tmp-promise'
import { BootstrapChptr } from './bootstrap-functions'
import yaml = require('js-yaml')
import { exec } from 'child_process'
import * as moment from 'moment'

const debug = d('core-utils')

// TODO: implement IoC (DI) with https://www.npmjs.com/package/typescript-ioc
@Singleton
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
    this.hardConfig = Container.get(HardConfig) //new HardConfig(rootPath)
    this.rootPath = rootPath
    this.markupUtils = Container.get(MarkupUtils) // new MarkupUtils(softConfig, rootPath)
    this.fsUtils = new FsUtils()
    this.statistics = Container.get(Statistics) // new Statistics(softConfig, rootPath)
    this.gitUtils = Container.get(GitUtils) // new GitUtils(softConfig, rootPath)
  }

  //#region project files manipulations

  public processContent(initialContent: string): string {
    let paraCounter = 1
    // \u2028 = line sep  \u200D = zero width joiner
    const replacedContent = this.processContentBack(initialContent)
      .replace(/\n+-{1,2}\s?(?!>|->)/g, '\n\n-- ')
      .replace(/([.!?…}*"]) {2}([\"*\-A-Z{À-Ú])/gm, '$1' + this.markupUtils.sentenceBreakChar + '\n$2')
      .replace(/([.!?…}*"])\n{2}([\"*\-A-Z{À-Ú])(?!\*{2})/gm, (_full, one, two) => {
        paraCounter++
        return `${one}\n\n${this.markupUtils.paragraphBreakChar}{{${paraCounter}}}\n${two}`
      })
      .replace(/(\d{1,2})h(\d{2})/g, '$1\u00A0h\u00A0$2')
      .replace(/^(\*\s.*)\n(?=\*)/gm, '$1\n\n')

    return replacedContent
  }

  public processContentBack(initialContent: string): string {
    const sentenceBreakRegex = new RegExp(this.markupUtils.sentenceBreakChar + '\\n', 'g')
    const paragraphBreakRegex = new RegExp('\\n\\n' + this.markupUtils.paragraphBreakChar + '{{\\d+}}\\n', 'g')

    const replacedContent = initialContent
      .replace(sentenceBreakRegex, '  ')
      .replace(paragraphBreakRegex, '\n\n')
      .replace(/—/gm, '--')
      .replace(/’/gm, "'")
      .replace(/“/gm, '"')
      .replace(/”/gm, '"')
      .replace(/([.!?…}*"]) +\n/g, '$1\n')
      .replace(/\n-{1,2}\s?(?!>|->)/g, '\n-')
      .replace(/^-(.*)\n\n(?=-)/gm, '-$1\n')
      .replace(/^(\*\s.*)\n\n(?=\*\s|{{\d+}}\n\*\s)/gm, '$1\n')
      .replace(/ --$/gm, '\u00A0--')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n*$/, '\n')

    // debug(`processContentBack: ${replacedContent}`)
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

  public async preProcessAndCommitFiles(message: string, toStageFiles?: string[], forDeletes = false) {
    return this.gitUtils.CommitToGit(message, this.processChapterFilesBeforeSaving.bind(this), toStageFiles, forDeletes)
  }

  public async addChapterFiles(name: string, atNumbering: boolean, number?: string, content?: string): Promise<string[]> {
    let chapterId: ChapterId
    if (number) {
      chapterId = new ChapterId(this.softConfig.extractNumber(number), atNumbering)

      await this.statistics.getAllFilesForOneType(atNumbering)
      chapterId.fixedDigits = this.statistics.getMaxNecessaryDigits(atNumbering)

      // debug(`chapterId.fixedDigits = ${chapterId.fixedDigits}`)
      // debug(`statistics = ${JSON.stringify(this.statistics, null, 2)}`)

      const existingFile = await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId)))

      if (existingFile.length > 0) {
        throw new ChptrError(`File ${existingFile[0]} already exists`, 'add.addchapterfiles', 1)
      }
    } else {
      await this.statistics.refreshStats()
      // await this.statistics.updateStackStatistics(atNumbering)

      const highestNumber = this.statistics.getHighestNumber(atNumbering)
      // debug(`highestNumber in add-chapter-files before adding one: ${highestNumber}`)
      chapterId = new ChapterId(
        highestNumber === 0 ? this.softConfig.config.numberingInitial : highestNumber + this.softConfig.config.numberingStep,
        atNumbering
      )
    }

    const emptyFileString = this.softConfig.emptyFileString.toString()
    let filledTemplateData = emptyFileString.replace(/{TITLE}/gim, name)
    if (content) {
      filledTemplateData = content
    }
    const metadataObj: any = this.softConfig.config.metadataFields
    metadataObj.computed.title = name
    metadataObj.computed.wordCount = this.markupUtils.GetWordCount(filledTemplateData)
    const filledTemplateMeta = this.softConfig.stringifyPerStyle(metadataObj)

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

    cli.action.start('Creating file(s)'.actionStartColor())

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

    await this.statistics.refreshStats()

    const originId = await this.checkArgPromptAndExtractChapterId(origin, 'What chapter to use as origin?')

    const destinationId = await this.checkArgPromptAndExtractChapterId(destination, 'What chapter to use as destination?', true)

    if (!originId) {
      throw new ChptrError('You need to provide a valid origin chapter', 'initialized-base.reorder.destination', 10)
    }
    if (!destinationId) {
      throw new ChptrError('You need to provide a valid destination chapter', 'initialized-base.reorder.destination', 11)
    }

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
    // const moveTempPromises: Promise<MoveSummary>[] = []
    for (const file of toRenameFiles.map(f => f.file)) {
      const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(file)
      const toFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, fromFilename))
      // debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)

      await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, toFilename))

      // moveTempPromises.push(this.gitUtils.mv(fromFilename, toFilename))
      await this.gitUtils.mv(fromFilename, toFilename)
    }
    // await Promise.all(moveTempPromises)

    // let aForAtNumbering = false

    // for (const file of this.softConfig.filesWithChapterNumbersInContent) {
    //   let content = await this.fsUtils.readFileContent(file)
    //   for (const from of toRenameFiles.map(f => {
    //     return {
    //       number: this.softConfig.extractNumber(f.file),
    //       isAtNumber: this.softConfig.isAtNumbering(f.file)
    //     }
    //   })) {
    //     const fromNumberRE = new RegExp(`(?<!%|\w)(${from.isAtNumber ? '(a|@)' : '()'}0*${from.number})(?!%|\w)`, 'gm')
    //     //  (?<!%|\w)((?:a|@)?\d+)(?!%|\w)
    //     content = content.replace(fromNumberRE, '%$1%')
    //     aForAtNumbering = aForAtNumbering || content.replace(fromNumberRE, '$2') === 'a'
    //   }
    //   await this.fsUtils.writeFile(file, content)
    // }

    cli.action.stop(tempDir.actionStopColor())

    cli.action.start('Moving files to their final states'.actionStartColor())
    let fileMovesPretty = ''

    // try {
    // const moveBackPromises: Promise<MoveSummary>[] = []
    for (const moveItem of toRenameFiles) {
      const filename = this.softConfig.mapFileToBeRelativeToRootPath(moveItem.file)
      const newFileNumber: number = moveItem.newFileNumber
      const destDigits = this.statistics.getMaxNecessaryDigits(destinationId.isAtNumber)

      const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, filename))
      const toFilename = this.softConfig.renumberedFilename(filename, newFileNumber, destDigits, destinationId.isAtNumber)

      await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, toFilename))

      // debug(`TEMPed file: ${fromFilename} BACK TO ${toFilename}`)

      fileMovesPretty.concat(`\n    renaming from "${fromFilename}" to "${toFilename}"`)
      // moveBackPromises.push(this.gitUtils.mv(fromFilename, toFilename))
      await this.gitUtils.mv(fromFilename, toFilename)
    }
    // await Promise.all(moveBackPromises)

    // for (const file of this.softConfig.filesWithChapterNumbersInContent) {
    //   let content = await this.fsUtils.readFileContent(file)
    //   for (const moveNumbers of toRenameFiles.map(f => {
    //     return {
    //       fromNumber: this.softConfig.extractNumber(f.file),
    //       fromIsAtNumber: this.softConfig.isAtNumbering(f.file),
    //       toNumber: f.newFileNumber
    //     }
    //   })) {
    //     const fromNumberRE = new RegExp(`(?<!\w)(%${moveNumbers.fromIsAtNumber ? '(?:a|@)' : ''}0*${moveNumbers.fromNumber}%)(?!\w)`, 'gm')
    //     //  (?<!%|\w)((?:a|@)?\d+)(?!%|\w)
    //     content = content.replace(fromNumberRE, `${destinationId.isAtNumber ? (aForAtNumbering ? 'a' : '@') : ''}${moveNumbers.toNumber}`)
    //   }
    //   await this.fsUtils.writeFile(file, content)
    // }

    const aForAtNumbering = await this.moveChapterNumbersInFileContentToTemp(toRenameFiles.map(trf => trf.file))
    const fixedDigits = this.statistics.getMaxNecessaryDigits(destinationId.isAtNumber)
    await this.moveChapterNumbersInFileContentToDestination(
      toRenameFiles.map(trf => {
        return { file: trf.file, destId: new ChapterId(trf.newFileNumber, destinationId.isAtNumber, fixedDigits) }
      }),
      aForAtNumbering
    )
    await this.rewriteLabelsInFilesWithNumbersInContent(aForAtNumbering)

    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)

    cli.action.stop('done'.actionStopColor())
  }

  //#endregion

  public async checkArgPromptAndExtractChapterId(chapterInput: string, promptMsg: string, nextId = false): Promise<ChapterId | null> {
    // debug(`chapterInput = ${chapterInput}`)
    if (!chapterInput) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('chapter', queryBuilder.textinput(promptMsg, ''))
      const queryResponses: any = await queryBuilder.responses()
      chapterInput = queryResponses.chapter
    }

    const isAtNumbering = this.softConfig.isAtNumbering(chapterInput)
    // debug(`isAtNumbering in checkArgsPrompt = ${isAtNumbering}`)
    let num: number
    if (this.hardConfig.isEndOfStack(chapterInput)) {
      await this.statistics.refreshStats()
      // await this.statistics.updateStackStatistics(isAtNumbering)
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

  //Project file updates
  public async addDigitsToNecessaryStacks(): Promise<boolean> {
    let didAddDigits = false
    await this.statistics.refreshStats()
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
    debug('core-utils.compactFileNumber()')

    const table = tableize('from', 'to')
    const moves: { fromFilename: string; toFilename: string; destDigits: number }[] = []
    // const movePromises: Promise<MoveSummary>[] = []
    const fromFilenames: string[] = []
    const { tempDir, removeTempDir } = await this.fsUtils.getTempDir(this.rootPath)
    const tempDirForGit = this.softConfig.mapFileToBeRelativeToRootPath(tempDir)

    for (const b of [true, false]) {
      await this.statistics.refreshStats()
      const destDigits = this.statistics.getMaxNecessaryDigits(b)

      const wildcards = [this.softConfig.chapterWildcard(b), this.softConfig.metadataWildcard(b), this.softConfig.summaryWildcard(b)]
      for (const wildcard of wildcards) {
        const files = await this.fsUtils.listFiles(path.join(this.rootPath, wildcard))

        const organizedFiles: any[] = []
        for (const file of files) {
          organizedFiles.push({ number: this.softConfig.extractNumber(file), filename: file })
        }

        // const destDigits = this.statistics.getMaxNecessaryDigits(b)
        let currentNumber = this.softConfig.config.numberingInitial

        for (const file of organizedFiles.sort((a, b) => a.number - b.number)) {
          const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(file.filename)
          const toFilename = this.softConfig.renumberedFilename(fromFilename, currentNumber, destDigits, b)

          if (fromFilename !== toFilename) {
            moves.push({ fromFilename, toFilename, destDigits })
            // debug(`from: ${fromFilename} to: ${toFilename}`)
            table.accumulator(fromFilename, toFilename)
            // movePromises.push(this.gitUtils.mv(fromFilename, path.join(tempDirForGit, toFilename)))
            await this.gitUtils.mv(fromFilename, path.join(tempDirForGit, toFilename))
            fromFilenames.push(file.filename)
          }
          currentNumber += this.softConfig.config.numberingStep
        }
      }
    }
    // await Promise.all(movePromises)

    for (const renumbering of moves) {
      // movePromises.push(this.gitUtils.mv(path.join(tempDirForGit, renumbering.toFilename), renumbering.toFilename))
      await this.gitUtils.mv(path.join(tempDirForGit, renumbering.toFilename), renumbering.toFilename)
    }
    // await Promise.all(movePromises)

    const aForAtNumbering = await this.moveChapterNumbersInFileContentToTemp(fromFilenames)
    await this.moveChapterNumbersInFileContentToDestination(
      moves.map(v => {
        return {
          file: v.fromFilename,
          destId: new ChapterId(this.softConfig.extractNumber(v.toFilename), this.softConfig.isAtNumbering(v.toFilename), v.destDigits)
        }
      }),
      aForAtNumbering
    )
    await this.rewriteLabelsInFilesWithNumbersInContent(aForAtNumbering)

    await removeTempDir()

    if (moves.length === 0) {
      cli.action.stop(`no compacting was needed`.actionStopColor())
    } else {
      await this.addDigitsToNecessaryStacks()
      cli.action.stop(`done:`.actionStopColor())
      table.show()
    }
  }

  public async buildOutput(
    // removeMarkup: boolean,
    // withSummaries: boolean,
    buildType: BuildType,
    withIntermediary: boolean,
    outputFiletype: any,
    outputFile: string
  ): Promise<string[]> {
    debug('Running Build Output')

    const outputToProd: boolean = buildType == BuildType.prod
    const outputToPreProd: boolean = buildType == BuildType.preProd
    const outputToDev: boolean = !outputToProd && !outputToPreProd

    const tmpMDfile = await tmpFile()
    const tmpMDfileTex = await tmpFile()
    const allOutputFilePath: string[] = []
    // debug(`temp files = ${tmpMDfile.path} and for tex = ${tmpMDfileTex.path}`)

    try {
      const originalChapterFilesArray = (
        await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcard(false)))
      ).sort()

      cli.action.start('Compiling and generating output files'.actionStartColor())

      let fullOriginalContent = this.softConfig.globalMetadataContent

      const toAddFilesBefore = this.softConfig.buildFilesBefore
      // const toAddFiles = ['readme.md', 'index.md']
      for await (const filePath of toAddFilesBefore) {
        // const filePath = path.join(this.rootPath, file)
        if (await this.fsUtils.fileExists(filePath)) {
          let fileContent = await this.fsUtils.readFileContent(filePath)
          // readme = readme.replace(/^\n#+\s.*?\n+/s, '')
          fullOriginalContent += '\n' + fileContent
        }
      }

      const bootstrapChptr = new BootstrapChptr(this.rootPath)

      for (const file of originalChapterFilesArray) {
        fullOriginalContent += '\n'
        const chapterContent = await this.fsUtils.readFileContent(file)
        if (outputToDev) {
          const number = this.softConfig.extractNumber(file)
          const chapterId = new ChapterId(number, false)

          const summaryFile = (
            await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(chapterId)))
          )[0]
          const summaryContent = await this.fsUtils.readFileContent(summaryFile)
          // const summaryRE = /^(?!# )(?!{{\d+}})(.+)$/gm
          const summaryRE = /^(?!# )(.+)$/gm
          const titleRE = /# (.*)\n/
          fullOriginalContent += summaryContent
            .replace(/^{{\d+}}$/gm, '')
            .replace(titleRE, `# (${number.toString()}) $1\n`)
            .replace(summaryRE, '> *$1*')
          fullOriginalContent += '\n\n````\n'

          const metadataFile = (
            await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.metadataWildcardWithNumber(chapterId)))
          )[0]
          const metadataContent = await this.fsUtils.readFileContent(metadataFile)
          const metadataObj = this.softConfig.parsePerStyle(metadataContent)
          let filteredMetadataObj: any = bootstrapChptr.deepCopy(metadataObj)

          fullOriginalContent += yaml.safeDump(filteredMetadataObj) //.replace(/\n/g, '\n\n')
          fullOriginalContent += '````\n\n'

          fullOriginalContent += chapterContent.replace(titleRE, '***\n')
        } else {
          fullOriginalContent += chapterContent
        }
      }

      const toAddFilesAfter = this.softConfig.buildFilesAfter
      for await (const filePath of toAddFilesAfter) {
        if (await this.fsUtils.fileExists(filePath)) {
          let fileContent = await this.fsUtils.readFileContent(filePath)
          fullOriginalContent += '\n' + fileContent
        }
      }

      const fullCleanedOrTransformedContent = outputToProd
        ? this.markupUtils.transformToProdMarkupContent(fullOriginalContent)
        : outputToPreProd
        ? this.markupUtils.transformToPreProdMarkupContent(fullOriginalContent)
        : this.markupUtils.transformToDevMarkupContent(fullOriginalContent)
      await this.fsUtils.writeInFile(tmpMDfile.fd, fullCleanedOrTransformedContent)
      await this.fsUtils.writeInFile(
        tmpMDfileTex.fd,
        fullCleanedOrTransformedContent
          // .replace(/^\*\s?\*\s?\*$/gm, '\\asterism')
          .replace(/\u200B/g, '')
          .replace(/^:{4}\s?(.+?)(-right|-left)?$/gm, ':::: encadre$2')

        // .replace(/\\textbf{/gm, '\\merriweatherblack{')
      )

      // todo: make chapter.lua run only on prod, and add numbering for working copies.

      const tempMdFilePath = path.join(this.softConfig.buildDirectory, 'tempMdFile.md')
      if (withIntermediary) {
        await this.fsUtils.createFile(tempMdFilePath, fullCleanedOrTransformedContent)
      }

      let chaptersFile = tmpMDfile.path// '"' + tmpMDfile.path + '" '

      const pandocRuns: Promise<string>[] = []
      const allLuaFilters = await this.fsUtils.listFiles(path.join(this.hardConfig.configPath, '*.all.lua'))
      const prodLuaFilters = await this.fsUtils.listFiles(path.join(this.hardConfig.configPath, '*.prod.lua'))
      if (outputToProd || outputToPreProd) {
        allLuaFilters.push(...prodLuaFilters)
      }

      for (const filetype of outputFiletype) {
        const fullOutputFilePath = path.join(this.softConfig.buildDirectory, outputFile + '.' + filetype)
        allOutputFilePath.push(fullOutputFilePath)

        const pandocArgs = await this.generatePandocArgs(
          filetype,
          allLuaFilters,
          chaptersFile,
          tmpMDfileTex.path,
          tmpMDfile.path,
          outputToProd,
          fullOutputFilePath          
        )

        pandocRuns.push(this.runPandoc(pandocArgs))
      }

      await Promise.all(pandocRuns).catch(async err => {
        await this.fsUtils.createFile(tempMdFilePath, fullCleanedOrTransformedContent)
        throw new ChptrError(
          `Error trying to run Pandoc.  You need to have it installed and accessible globally, with version 2.7.3 minimally.\nLook into ${tempMdFilePath.toString()} with following error:\n${err
            .toString()
            .errorColor()}\nYou can delete temp file afterwards.`,
          'command:build:index',
          52
        )
      })

      if (outputFiletype.indexOf('html') >= 0) {
      }

      const allOutputFilePathPretty = allOutputFilePath.reduce((previous, current) => `${previous}\n    ${current}`, '')
      cli.action.stop(allOutputFilePathPretty.actionStopColor())
    } catch (err) {
      throw new ChptrError(err, 'build.run', 3)
    } finally {
      await tmpMDfile.cleanup()
      await tmpMDfileTex.cleanup()
    }

    await this.runPostBuildStep()
    return allOutputFilePath
  }

  public async generatePandocArgs(
    filetype: any,
    allLuaFilters: string[],
    chaptersFile: string,
    tmpMDfileTexPath : string,
    tmpMDfilePath : string,
    outputToProd: boolean,
    fullOutputFilePath: string
  ): Promise<string[]> {
    debug(`chaptersFile = ${chaptersFile}`)
    let pandocArgs: string[] = ['--strip-comments', '--from', 'markdown+emoji']

    if (filetype === 'md') {
      pandocArgs = pandocArgs.concat([
        // '--number-sections',
        '--to',
        'markdown-raw_html+smart+fancy_lists+definition_lists',
        '--wrap=none',
        '--atx-headers'
      ])
      pandocArgs = pandocArgs.concat(await this.luaFilters('*.md.lua', allLuaFilters))
    }

    if (filetype === 'docx') {
      const referenceDocFullPath = path.join(this.hardConfig.configPath, 'reference.docx')
      if (await this.fsUtils.fileExists(referenceDocFullPath)) {
        pandocArgs = pandocArgs.concat([`--reference-doc="${referenceDocFullPath}"`])
      } else {
        cli.warn(`For a better output, create an empty styled Word doc at ${referenceDocFullPath}`)
      }

      pandocArgs = pandocArgs.concat(await this.luaFilters('*.docx.lua', allLuaFilters))

      pandocArgs = pandocArgs.concat([
        '--to',
        'docx+smart+fancy_lists+fenced_divs+definition_lists',
        '--top-level-division=chapter'
        // '--number-sections'
      ])
    }

    if (filetype === 'html') {
      const templateFullPath = path.join(this.hardConfig.configPath, 'template.html')
      if (await this.fsUtils.fileExists(templateFullPath)) {
        pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
      } else {
        cli.warn(`For a better output, create an html template at ${templateFullPath}`)
      }
      pandocArgs = pandocArgs.concat(await this.luaFilters('*.html.lua', allLuaFilters))

      const cssFullPath = path.join(this.hardConfig.configPath, 'template.css')
      if (await this.fsUtils.fileExists(cssFullPath)) {
        pandocArgs = pandocArgs.concat([`--css`, `"${cssFullPath}"`])
      } else {
        cli.warn(`For a better output, create a css template at ${cssFullPath}`)
      }

      pandocArgs = pandocArgs.concat([
        '--to',
        'html5+smart+fancy_lists+definition_lists',
        // '--toc',
        // '--toc-depth',
        // '1',
        '--top-level-division=chapter',
        '--self-contained'
      ])
    }

    if (filetype === 'pdf' || filetype === 'tex') {
      chaptersFile = '"' + tmpMDfileTexPath + '" '

      const templateFullPath = path.join(this.hardConfig.configPath, 'template.latex')
      if (await this.fsUtils.fileExists(templateFullPath)) {
        pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
      } else {
        cli.warn(`For a better output, create a latex template at ${templateFullPath}`)
      }

      pandocArgs = pandocArgs.concat(await this.luaFilters('*.latex.lua', allLuaFilters))
      pandocArgs = pandocArgs.concat([
        '--top-level-division=chapter',
        '--pdf-engine=xelatex',
        '--to',
        'latex+raw_tex+smart+fancy_lists-emoji+definition_lists'
      ])
    } else {
      chaptersFile = '"' + tmpMDfilePath + '" '
    }

    if (filetype === 'epub') {
      pandocArgs = pandocArgs.concat([
        '--to',
        'epub+smart+fancy_lists+definition_lists',
        // '--toc',
        // '--toc-depth',
        // '1',
        '--top-level-division=chapter'
      ])

      const cssFullPath = path.join(this.hardConfig.configPath, 'epub.css')
      if (await this.fsUtils.fileExists(cssFullPath)) {
        pandocArgs = pandocArgs.concat([`--css`, `"${cssFullPath}"`])
      } else {
        cli.warn(`For a better output, create a css template at ${cssFullPath}`)
      }

      const fontPath = path.join(this.hardConfig.configPath, 'DejaVuSans.ttf')
      if (await this.fsUtils.fileExists(cssFullPath)) {
        pandocArgs = pandocArgs.concat([`--epub-embed-font="${fontPath}"`])
      }
      pandocArgs = pandocArgs.concat(await this.luaFilters('*.epub.lua', allLuaFilters))
    }

    if (!outputToProd) {
      pandocArgs = pandocArgs.concat(['--toc', '--toc-depth', '1'])
    }

    debug(`chaptersFile = ${chaptersFile}`)

    pandocArgs = [
      chaptersFile, //`"${chaptersFile}" `,
      // '--smart',
      '--standalone',
      '-o',
      `"${fullOutputFilePath}"`
    ].concat(pandocArgs)

    return pandocArgs;
    // pandocRuns.push(this.runPandoc(pandocArgs))
    // return chaptersFile
  }

  private async luaFilters(wildcard: string, otherFiles: string[]): Promise<string[]> {
    const luaFilePaths = (await this.fsUtils.listFiles(path.join(this.hardConfig.configPath, wildcard))).concat(otherFiles)
    let result: string[] = []
    for (const luaFilePath of luaFilePaths) {
      result = result.concat([`--lua-filter="${path.join(luaFilePath)}"`])
      debug(`lua-filter="${path.join(luaFilePath)}"`)
    }
    return result
  }

  private async runPostBuildStep(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.softConfig.config.postBuildStep) {
        try {
          cli.action.start('Running post-build step'.actionStartColor())
          exec(this.softConfig.postBuildStep, (err, pout, perr) => {
            if (err) {
              reject(err)
            }
            if (perr) {
              reject(perr)
            }
            cli.info(pout)
            resolve()
          })
          cli.action.stop(this.softConfig.postBuildStep.actionStopColor())
        } catch (err) {
          throw new ChptrError(err, 'build.run', 331)
        }
      } else {
        resolve()
      }
    })
  }
  public async runPandoc(options: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = 'pandoc ' + options.join(' ')
      cli.info(`Executing child process with command ${command.resultSecondaryColor()}`)
      exec(command, (err, pout, perr) => {
        if (err) {
          // this.error(err.toString().errorColor())
          reject(err)
        }
        if (perr) {
          // this.error(perr.toString().errorColor())
          reject(perr)
        }
        // if (pout) {
        //   this.log(pout)
        // }
        resolve(pout)
      })
    })
  }

  //todo: Merge this and next one in a single function
  private async moveChapterNumbersInFileContentToTemp(filenames: string[]): Promise<boolean> {
    let aForAtNumbering = false

    debug(`filesWithChapterNumbersInContent array : ${JSON.stringify(this.softConfig.filesWithChapterNumbersInContent)}`)
    for (const file of this.softConfig.filesWithChapterNumbersInContent) {
      debug(`file of filesWithChapterNumbersInContent = ${this.softConfig.filesWithChapterNumbersInContent}`)
      // await cli.anykey()
      let content = await this.fsUtils.readFileContent(file)
      for (const from of filenames
        .map(f => {
          return {
            number: this.softConfig.extractNumber(f),
            isAtNumber: this.softConfig.isAtNumbering(f)
          }
        })
        .filter((value, index, self) => {
          return self.indexOf(value) === index
        })) {
        const fromNumberRE = new RegExp(
          `(?<!\\d${from.isAtNumber ? '' : '|a|@'})(${from.isAtNumber ? '(a|@)' : '()'}0*${from.number})(?!%|\\w|\\d)`,
          'gm'
        )
        debug(`fromNumber = ${from.number}`)
        debug(`fromNumberRE = ${fromNumberRE.toString()}`)
        content = content.replace(fromNumberRE, '%$1%')
        // await cli.anykey()
        const firstAtMatch = content.match(fromNumberRE)
        aForAtNumbering = aForAtNumbering || (firstAtMatch ? firstAtMatch[0][2] === 'a' : false)
      }
      // debug(`${file} file content in the middle of the change: \n${content}`)
      await this.fsUtils.writeFile(file, content)
      // await cli.anykey()
    }

    return aForAtNumbering
  }

  private async moveChapterNumbersInFileContentToDestination(
    filesWithInfo: { file: string; destId: ChapterId }[],
    aForAtNumbering: boolean
  ) {
    for (const file of this.softConfig.filesWithChapterNumbersInContent) {
      let content = await this.fsUtils.readFileContent(file)
      for (const moveNumbers of filesWithInfo.map(f => {
        return {
          fromNumber: this.softConfig.extractNumber(f.file),
          fromIsAtNumber: this.softConfig.isAtNumbering(f.file),
          toNumber: f.destId.stringifyNumber(), //f.newFileNumber,
          destIsAtNumber: f.destId.isAtNumber // f.destIsAtNumber
        }
      })) {
        const fromNumberRE = new RegExp(
          // `(?<!\\w|\\d)` +
          `(%${moveNumbers.fromIsAtNumber ? '(?:a|@)' : ''}0*${moveNumbers.fromNumber}%)`,
          //+ `(?!\\w|\\d)`
          'gm'
        )
        //  (?<!%|\w)((?:a|@)?\d+)(?!%|\w)
        debug(
          `${file} will change ${fromNumberRE} to ${moveNumbers.destIsAtNumber ? (aForAtNumbering ? 'a' : '@') : ''}${moveNumbers.toNumber}`
        )
        content = content.replace(fromNumberRE, `${moveNumbers.destIsAtNumber ? (aForAtNumbering ? 'a' : '@') : ''}${moveNumbers.toNumber}`)
      }

      await this.fsUtils.writeFile(file, content)
    }
  }

  //todo: make sure this is called from all places needed (all builds, move, compact, etc.)
  public async rewriteLabelsInFilesWithNumbersInContent(aForAtNumbering: boolean) {
    const allMetadataFiles = await this.softConfig.getAllMetadataFiles()
    const allFilesWithChapterInfo: any[] = []
    for (const metadataFile of allMetadataFiles) {
      const metaNumber = this.softConfig.extractNumber(metadataFile)
      // debug(`meta number = ${metaNumber}`)
      const metaStringContent = await this.fsUtils.readFileContent(metadataFile)
      const meta = this.softConfig.parsePerStyle(metaStringContent)
      let timeInterval: string = '. '
      try {
        const hourStart = moment(meta.manual.start, 'HH:mm')
        if (hourStart.isValid()) {
          timeInterval += `${hourStart.format('HH:mm')}`
          const hourEnd = hourStart.add(meta.manual.duration, 'minutes')
          if (hourEnd.isValid() && meta.manual.duration) {
            timeInterval += `-${hourEnd.format('HH:mm')}`
          }
        } else {
          timeInterval = ''
        }
      } catch (error) {
        timeInterval = '?'
      }

      // debug(`timeInterval: ${timeInterval.toString()}`)

      allFilesWithChapterInfo.push({
        number: metaNumber,
        title: this.fsUtils.sanitizeMermaid(meta.computed.title),
        isAtNumber: this.softConfig.isAtNumbering(metadataFile),
        timeInterval: timeInterval
      })
    }

    for (const file of this.softConfig.filesWithChapterNumbersInContent) {
      // debug(`file to modify: ${file}`)
      let content = await this.fsUtils.readFileContent(file)

      for (const chapter of allFilesWithChapterInfo) {
        // debug(`chapter: ${JSON.stringify(chapter)}`)
        const fromRE = new RegExp(
          `\\(${chapter.isAtNumber ? (aForAtNumbering ? 'a' : '@') : ''}0*${chapter.number}\\s.*?(?:\\.\\s+\\d+:\\d+-\\d+:\\d+)?(\\)+)$`,
          'gm'
        )
        // debug(`fromRE: ${fromRE}`)
        content = content.replace(
          fromRE,
          `(${chapter.isAtNumber ? (aForAtNumbering ? 'a' : '@') : ''}${chapter.number} ${chapter.title}${chapter.timeInterval}$1`
        )
      }

      await this.fsUtils.writeFile(file, content)
    }
  }

  private cleanEmptySubgraphs = (content: string): string => {
    const subgraphRE = new RegExp(/^\s*?subgraph .*?\n\s*?end$/gm)
    const result = content.replace(subgraphRE, '')
    if (subgraphRE.test(result)) {
      return this.cleanEmptySubgraphs(result)
    } else {
      return result
    }
  }

  public async createCharacterTimelines() {
    if (!this.softConfig.timelineFile) {
      debug('no timeline file')
      return
    }

    const timelineContent = await this.fsUtils.readFileContent(this.softConfig.timelineFile)
    const allMetadataFiles = await this.softConfig.getAllMetadataFiles(true)
    const metaObj = []

    for (const metadataFile of allMetadataFiles) {
      const metaNumberWithZeroes = this.softConfig.extractNumberWithLeadingZeroes(metadataFile)
      const metaNumber = this.softConfig.extractNumber(metadataFile)
      const metaStringContent = await this.fsUtils.readFileContent(metadataFile)
      const metadataObj = this.softConfig.parsePerStyle(metaStringContent)
      // const props = metadataObj.extracted.prop
      const charactersInChapter: string[] = metadataObj.manual.characters.map((c: { character: string }) =>
        this.softConfig.getFinalPropFor(c.character)
      )
      // debug(`obj: ${JSON.stringify(metadataObj)}`)
      // debug(`props: ${JSON.stringify(props)}`)
      // debug(`number: ${metaNumber}, characters: ${charactersInChapter || []}`)
      metaObj.push({ number: metaNumber, numberWithZeroes: metaNumberWithZeroes, characters: charactersInChapter || [] }) // props: props || [] })
    }

    if (metaObj.length === 0) {
      return
    }
    const charactersWithTimelines = [
      ...new Set(
        metaObj
          .map(m => m.characters)
          .reduce((pv, cv) => pv.concat(cv), [])
          .filter(f => f != '')
      )
    ]

    const cleanUnusedTimeReferences = (content: string, relevantChapterNumbers: number[]): string => {
      let newContent = ''
      // const timeReferencesRE = new RegExp(/$\s*(?:j|v)\w+?(?:(?:-.*?>)|(?:={3}))(\d+)/gm)
      const timeReferencesRE = new RegExp(/$\s*([jav]?\d+) ?(?:(?:<?-\.?->)|(?:={3})) ?(?:\|.*?\|)?([jav]?\d+)$/gm)
      const isTimeRefRE = new RegExp(/^[jav]\d+$/)

      let regexArray: RegExpExecArray | null
      let lastIndex = 0

      while ((regexArray = timeReferencesRE.exec(content)) !== null) {
        // debug(`content=${content}\n\n`)
        const match1 = regexArray[1]
        const match2 = regexArray[2]
        const catchedBothChapterInRelevantChapters =
          relevantChapterNumbers.indexOf(parseInt(match1, 10)) >= 0 && relevantChapterNumbers.indexOf(parseInt(match2, 10)) >= 0
        // const hasOneOrTwoTimeReferences = isTimeRefRE.test(match1) || isTimeRefRE.test(match2)
        const catchedOneChapterInRelevantChaptersAndTimeReference =
          (relevantChapterNumbers.indexOf(parseInt(match1, 10)) >= 0 && isTimeRefRE.test(match2)) ||
          (relevantChapterNumbers.indexOf(parseInt(match2, 10)) >= 0 && isTimeRefRE.test(match1))
        const areBothTimeReferences = isTimeRefRE.test(match1) && isTimeRefRE.test(match2)
        // debug(
        //   `match0: ${regexArray[0]}\n
        //   match1: ${match1}\n
        //   match2: ${match2}\n
        //   catchedBothChapterInRelevantChapters: ${catchedBothChapterInRelevantChapters}\n
        //   catchedOneChapterInRelevantChaptersAndTimeReference: ${catchedOneChapterInRelevantChaptersAndTimeReference}\n
        //   areBothTimeReferences: ${areBothTimeReferences}\n`
        // )
        const endIndex =
          catchedBothChapterInRelevantChapters || catchedOneChapterInRelevantChaptersAndTimeReference || areBothTimeReferences
            ? timeReferencesRE.lastIndex
            : regexArray.index
        newContent += content.substring(lastIndex, endIndex)
        lastIndex = timeReferencesRE.lastIndex
      }
      newContent += content.substring(lastIndex)
      return newContent
    }

    for (const character of charactersWithTimelines) {
      // if (character == 'Paule Sainte-Marie') debug(`character = ${character}`)

      const relevantChapters = metaObj.filter(f => {
        return f.characters.indexOf(character) >= 0
      })

      if (character == 'Mehdi') debug(`relevantChapters: ${JSON.stringify(relevantChapters)}`)

      const chapterListWithZeroes = relevantChapters.map(c => `(?:${c.numberWithZeroes})`).reduce((pv, cv) => `${pv ? pv + '|' : ''}${cv}`)
      const chapterNumberList = relevantChapters.map(c => c.number)
      const chapterListRegEx = new RegExp(`(?<!\\d)(?:${chapterListWithZeroes})(?!\\d)`)
      const letterRegEx = new RegExp(/^\s*[^\d\s]/)

      // if (character == 'Paule') debug(`chapterListRegex: ${chapterListRegEx}`)

      const thisCharacterTimeline = cleanUnusedTimeReferences(
        this.cleanEmptySubgraphs(
          timelineContent
            .split('\n')
            .filter(f => {
              const isLetterFirst = letterRegEx.test(f)
              const isEmptyLine = f === ''
              const isInChapterList = chapterListRegEx.test(f)
              return isLetterFirst || isEmptyLine || isInChapterList
            })
            .join('\n')
        ),
        chapterNumberList
      )
      await this.fsUtils.writeFile(
        path.join(this.softConfig.buildDirectory, `timeline_${this.fsUtils.sanitizeFileName(character, undefined, true)}.md`),
        thisCharacterTimeline
      )
    }
  }

  public async setNumbersInChosenItemsOfMetadata() {
    const allMetadataFiles = await this.softConfig.getAllMetadataFiles(true)

    const chosenItemsTOC: string[] = []
    const perSectionTOC: {
      section: string
      subsections: {
        subsection: string
        toc: string[]
      }[]
    }[] = []
    //{ section: string; subSection: string; toc: string[] }[] = []

    const addToSectionTOC = (originalSection: string, originalSubSection: string, toc: string[]) => {
      const section = this.softConfig.getFinalPropFor(originalSection).replace('reader', 'Lecteur')
      const subsection = originalSubSection
        .replace('learns', 'Apprend')
        .replace('thinks', 'Pense -peut-être à tort-')
        .replace('wantsToKnow', 'Veut savoir')
      const foundSection = perSectionTOC.find(f => f.section === section)
      // const indexToc = toc.map(t => t.replace(/^([\d#]+).*$/m, '$1'))
      const indexToc = toc.map(t => t.replace(/^([\d#]+).*$/m, '$1') + ` %% ${t.replace(/^[\d#]+ (.*)$/m, '$1')}`)
      if (foundSection) {
        const foundSubSection = foundSection.subsections.find(ss => ss.subsection === subsection)
        if (foundSubSection) {
          foundSubSection.toc.push(...indexToc)
        } else {
          foundSection.subsections.push({ subsection, toc: indexToc })
        }

        // foundSection.toc.push(...indexToc)
      } else {
        perSectionTOC.push({ section, subsections: [{ subsection, toc: indexToc }] })
      }
    }

    for (const metadataFile of allMetadataFiles) {
      // debug(`metadatafile: ${metadataFile}`)
      const metaNumberAsString = this.softConfig.extractNumberWithLeadingZeroes(metadataFile)
      const metaNumber = parseInt(metaNumberAsString, 10)
      const metaStringContent = await this.fsUtils.readFileContent(metadataFile)
      const metadataObj = this.softConfig.parsePerStyle(metaStringContent)
      const itemNumerotationRE = new RegExp(/^#(\d+)\s(.*)/)
      let currentNumber = 0

      const getItemNumber = (itemString: string): number => {
        if (itemNumerotationRE.test(itemString)) {
          const reResult = itemNumerotationRE.exec(itemString)
          if (reResult) {
            return parseInt(reResult[1], 10)
          }
        }
        return -1
      }

      const updateHighestNumber = (curStringArray: string[]): void => {
        if (!curStringArray) {
          return
        }

        curStringArray.map(curString => {
          // debug(`updating highest number from ${JSON.stringify(curString)}`)
          // if (itemNumerotationRE.test(curString)) {
          //   const reResult = itemNumerotationRE.exec(curString)
          //   if (reResult) {
          //     currentNumber = Math.max(parseInt(reResult[1], 10), currentNumber)
          //   }
          // }
          currentNumber = Math.max(getItemNumber(curString), currentNumber)
          // debug(`currentNumber: ${currentNumber}`)
        })
      }

      const applyNumerotation = (curStringArray: string[]): string[] => {
        if (!curStringArray) {
          return []
        }

        return curStringArray.map(curString => {
          if (itemNumerotationRE.test(curString)) {
            const curNumber = getItemNumber(curString)
            let curTitle: string = ''
            const reResult = itemNumerotationRE.exec(curString)
            if (reResult) {
              curTitle = reResult[2]
            }
            chosenItemsTOC.push(`${metaNumberAsString}#${curNumber}(${metaNumber}.${curNumber} ${this.fsUtils.sanitizeMermaid(curTitle)})`)
            // perSectionTOC.push({section: 'a', toc: `${metaNumberAsString}#${curNumber}`})
            return curString
          } else {
            currentNumber += 1
            chosenItemsTOC.push(
              `${metaNumberAsString}#${currentNumber}(${metaNumber}.${currentNumber} ${this.fsUtils.sanitizeMermaid(curString)})`
            )
            return `#${currentNumber} ${curString}`
          }
        })
      }

      // apply wildcards to real metadata manual fields
      const allNumberedFieldsIntermediate: string[] = []
      this.softConfig.config.metadataManualFieldsToNumber.forEach(fieldChain => {
        const levels = fieldChain.split('.')
        if (levels[levels.length - 1] === '*') {
          const firstPart = fieldChain.substr(0, fieldChain.length - 2)
          for (const lastLevel in metadataObj.manual[firstPart]) {
            if (Object.prototype.hasOwnProperty.call(metadataObj.manual[firstPart], lastLevel)) {
              const element = metadataObj.manual[firstPart][lastLevel]
              const concFieldChain = `${firstPart}.${lastLevel}`
              allNumberedFieldsIntermediate.push(concFieldChain)
              // debug('wildcard update')
            }
          }
        } else {
          allNumberedFieldsIntermediate.push(fieldChain)
          // debug('no wildcard update')
        }
      })
      // debug(`allNumberedFieldsIntermediate: ${allNumberedFieldsIntermediate}`)

      // apply array notation to real metadata manual fields
      const allNumberedFields: string[] = []
      allNumberedFieldsIntermediate.forEach(fieldChain => {
        const curObj = metadataObj.manual
        const levels = fieldChain.split('.')
        let hadArray = false
        for (let i = 0; i < levels.length; i++) {
          const curKey = levels[i]
          // debug(`i: ${i}  curKey: ${curKey}`)
          if (curKey.substr(curKey.length - 2) === '[]') {
            hadArray = true
            const curArray: any[] = curObj[curKey.substr(0, curKey.length - 2)]
            // debug(`curArray: ${JSON.stringify(curArray)}`)
            for (let j = 0; j < curArray.length; j++) {
              const element = curArray[j]
              const newFieldChain = `${fieldChain.substr(0, curKey.length - 2)}[${j}]${fieldChain.substr(curKey.length)}`
              // debug(`new FieldChain = ${newFieldChain}`)
              allNumberedFields.push(newFieldChain)
              // debug('with array update')
            }
          }
        }
        if (!hadArray) {
          // debug('no array update')
          allNumberedFields.push(fieldChain)
        }
      })

      // debug(`allNumberedFields: ${allNumberedFields}`)
      // debug(`currentNumber: ${currentNumber}`)
      const applyFunctionToAllFieldchains = (callback: (content: string[]) => string[] | void) =>
        allNumberedFields.forEach(fieldChain => {
          let curObj = metadataObj.manual
          const levels = fieldChain.replace(/\[(\d+)\]/g, '.$1').split('.')
          const reRes = new RegExp(/\.|(?:\[(\d+)\])/).exec(fieldChain)
          // debug(`fieldChain: ${fieldChain}\n  levels: ${levels}\n  length: ${levels.length}`)
          let val: string[] | void = []
          let swObj = null
          let tag = ''
          switch (levels.length) {
            case 1:
              swObj = curObj[levels[0]]
              val = callback(swObj)
              if (val) {
                curObj[levels[0]] = val
                addToSectionTOC(
                  tag,
                  '',
                  val.map(v => `${metaNumberAsString}${v}`)
                )
              }
              break
            case 2:
              swObj = curObj[levels[0]][levels[1]]
              tag = levels[0]
              // debug(`case 2: swObj: ${swObj}\n  upLvl: ${JSON.stringify(curObj[levels[0]])}`)
              val = callback(swObj)
              if (val) {
                curObj[levels[0]][levels[1]] = val
                addToSectionTOC(
                  tag,
                  levels[1],
                  val.map(v => `${metaNumberAsString}${v}`)
                )
              }
              break
            case 3:
              swObj = curObj[levels[0]][levels[1]][levels[2]]
              tag = curObj[levels[0]][levels[1]]['character']
              // debug(`case 3: swObj: ${swObj}\n upLvl: ${JSON.stringify(curObj[levels[0]][levels[1]])}`)
              val = callback(swObj)
              if (val) {
                curObj[levels[0]][levels[1]][levels[2]] = val
                addToSectionTOC(
                  tag,
                  levels[2],
                  val.map(v => `${metaNumberAsString}${v}`)
                )
              }
              break
            case 4:
              val = callback(curObj[levels[0]][levels[1]][levels[2]][levels[3]])
              if (val) {
                curObj[levels[0]][levels[1]][levels[2]][levels[3]] = val
                addToSectionTOC(
                  tag,
                  levels[3],
                  val.map(v => `${metaNumberAsString}${v}`)
                )
              }
              break
            default:
              break
          }
        })

      applyFunctionToAllFieldchains(updateHighestNumber)
      applyFunctionToAllFieldchains(applyNumerotation)

      const updatedContent = this.softConfig.stringifyPerStyle(metadataObj)
      if (metaStringContent !== updatedContent) {
        debug(`updatedContent = ${updatedContent}`)
        await this.fsUtils.writeFile(metadataFile, updatedContent)
      }
    }

    // const numRE = new RegExp(/^\s*?(\d*)#(\d*) /)
    await this.updateFollowUpFile(chosenItemsTOC, perSectionTOC)
  }

  public async formatDefinitionFiles() {
    var definitionFiles = this.softConfig.definitionFiles
    definitionFiles.forEach(async definitionFile => {
      var indexExists = !!definitionFile && (await this.fsUtils.fileExists(definitionFile))
      if (indexExists) {
        var initialContent = await this.fsUtils.readFileContent(definitionFile)
        var updatedContent = initialContent.replace(/\n\[?([A-zÀ-ú ()-]+?)\]? ?(?:{.+?})?\n\n: {4}(?=\w+)/gm, (match, one) => {
          return `\n[${one}]{.definition #${latinize(sanitize(one)).replace(/ /g, '-').replace(/[()]/g, '').toLowerCase()}}\n\n:    `
        })
        if (updatedContent !== initialContent) {
          await this.fsUtils.writeFile(definitionFile, updatedContent)
        }
      }
    })
  }

  private async updateFollowUpFile(
    globalTOC: string[],
    perSectionTOC: {
      section: string
      subsections: {
        subsection: string
        toc: string[]
      }[]
    }[]
  ) {
    const followupFile = this.softConfig.followupFile
    const content = await this.fsUtils.readFileContent(followupFile)

    const updateRegion = (str: string, regionContent: string, title: string): string => {
      const re = new RegExp(`^(.*)\\n((?: |\\t)*)%% region ${title}\\n.*?%% end region(.*)$`, 's')
      return str
        .replace(
          // /^(.*)\n((?: |\t)*)%% region (\w*)\n.*?%% end region(.*)$/s,
          re,
          `$1\n%% region ${title}\n${regionContent}\n%% end region\n$3`
        )
        .replace(/\n(?=\n\n)/gs, '')
        .replace(/\n\n(?=\s*?(?:subgraph|end))/gs, '\n')
    }

    const sortedGlobalTOC = globalTOC.sort((a, b) => {
      const getFloatFromString = (str: string) => {
        return parseFloat(
          str.replace(/^\s*(\d+)#(\d)(\d)?/, (match, pre, one, two) => {
            // debug(`in sort: match=${match}\n one=${one}\n two=${two}`)
            if (two) {
              return `${pre}.${one}${two}`
            } else {
              return `${pre}.0${one}`
            }
          })
        )
      }
      return getFloatFromString(a) - getFloatFromString(b)
      // const aNum = getFloatFromString(a)
      // const bNum = parseFloat(b.replace('#', '.'))
      // const bNum = getFloatFromString(b)
      // return aNum - bNum
    })

    let updatedContent = updateRegion(content, '    ' + sortedGlobalTOC.join('\n    '), 'TOC') + '\n'

    let subgraphsContent = ''
    const numRE = new RegExp(/^\s*?(\d*)#(\d*) /)
    perSectionTOC
      .sort((a, b) => {
        return a.section.localeCompare(b.section, 'fr', { sensitivity: 'base' })
      })
      .forEach(sec => {
        subgraphsContent += `    subgraph ${sec.section}\n`
        sec.subsections
          .sort((a, b) => {
            return a.subsection.localeCompare(b.subsection, 'fr', { sensitivity: 'base' })
          })
          .forEach(ss => {
            subgraphsContent += `      subgraph ${sec.section} ${ss.subsection}\n`
            subgraphsContent += `        ${ss.toc
              .sort((a, b) => {
                const aNum = parseFloat(a.replace(numRE, '$1.$2'))
                const bNum = parseFloat(b.replace(numRE, '$1.$2'))
                return aNum - bNum
              })
              .join('\n        ')}\n`
            subgraphsContent += `      end\n`
          })
        subgraphsContent += `    end\n`
      })
    // .map(sec => `    subgraph ${sec.section}\n        ${sec.toc.join('\n        ')}\n    end\n`)
    // .join('\n')

    subgraphsContent = this.cleanEmptySubgraphs(subgraphsContent)

    updatedContent = updateRegion(updatedContent, subgraphsContent, 'subgraphs') + '\n'

    await this.fsUtils.writeFile(followupFile, updatedContent)
  }

  private async addDigitsToFiles(files: string[], newDigitNumber: number, atNumberingStack: boolean): Promise<boolean> {
    // const promises: Promise<MoveSummary>[] = []
    let hasMadeChanges = false
    const table = tableize('from', 'to')
    const filesWithInfo: { file: string; destId: ChapterId }[] = []

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
          filesWithInfo.push({
            file: fromFilename,
            destId: new ChapterId(this.softConfig.extractNumber(toFilename), this.softConfig.isAtNumbering(toFilename), newDigitNumber)
            // newFileNumber: this.softConfig.extractNumber(toFilename),
            // destIsAtNumber: this.softConfig.isAtNumbering(toFilename)
          })
          // promises.push(this.gitUtils.mv(fromFilename, toFilename))
          await this.gitUtils.mv(fromFilename, toFilename)
          hasMadeChanges = true
        }
      }
    }
    const aForAtNumbering = await this.moveChapterNumbersInFileContentToTemp(filesWithInfo.map(fwi => fwi.file))
    await this.moveChapterNumbersInFileContentToDestination(filesWithInfo, aForAtNumbering)
    await this.rewriteLabelsInFilesWithNumbersInContent(aForAtNumbering)

    // await Promise.all(promises)
    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)

    table.show('Adding digits to files')
    return hasMadeChanges
  }
}

export enum BuildType {
  dev = 'DEV',
  preProd = 'PREPROD',
  prod = 'PROD'
}
