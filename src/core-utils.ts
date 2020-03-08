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

import { file as tmpFile } from 'tmp-promise'
import { BootstrapChptr } from './bootstrap-functions'
import yaml = require('js-yaml')
import { exec } from 'child_process'

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
      .replace(/’/gm, '\'')
      .replace(/“/gm, '"')
      .replace(/”/gm, '"')
      .replace(/([.!?…}*"]) +\n/g, '$1\n')
      .replace(/\n-{1,2}\s?(?!>|->)/g, '\n-')
      .replace(/^-(.*)\n\n(?=-)/gm, '-$1\n')
      .replace(/^(\*\s.*)\n\n(?=\*\s|{{\d+}}\n\*\s)/gm, '$1\n')
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
      chapterId = new ChapterId(this.softConfig.extractNumber(number), this.softConfig.isAtNumbering(number))

      await this.statistics.getAllFilesForOneType(atNumbering)
      chapterId.fixedDigits = this.statistics.getMaxNecessaryDigits(atNumbering)

      debug(`chapterId.fixedDigits = ${chapterId.fixedDigits}`)
      debug(`statistics = ${JSON.stringify(this.statistics, null, 2)}`)

      const existingFile = await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId)))

      if (existingFile.length > 0) {
        throw new ChptrError(`File ${existingFile[0]} already exists`, 'add.addchapterfiles', 1)
      }
    } else {
      await this.statistics.refreshStats()
      // await this.statistics.updateStackStatistics(atNumbering)

      const highestNumber = this.statistics.getHighestNumber(atNumbering)
      debug(`highestNumber in add-chapter-files before adding one: ${highestNumber}`)
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
    const moveTempPromises: Promise<MoveSummary>[] = []
    for (const file of toRenameFiles.map(f => f.file)) {
      const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(file)
      const toFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, fromFilename))
      debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)

      await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.rootPath, toFilename))

      moveTempPromises.push(this.gitUtils.mv(fromFilename, toFilename))
    }
    await Promise.all(moveTempPromises)

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

    const table = tableize('from', 'to')
    const moves: { fromFilename: string; toFilename: string; destDigits: number }[] = []
    const movePromises: Promise<MoveSummary>[] = []
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
            table.accumulator(fromFilename, toFilename)
            movePromises.push(this.gitUtils.mv(fromFilename, path.join(tempDirForGit, toFilename)))
            fromFilenames.push(file.filename)
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
    removeMarkup: boolean,
    withSummaries: boolean,
    withIntermediary: boolean,
    outputFiletype: any,
    outputFile: string
  ): Promise<void> {
    debug('Running Build Output')

    const tmpMDfile = await tmpFile()
    const tmpMDfileTex = await tmpFile()
    debug(`temp files = ${tmpMDfile.path} and for tex = ${tmpMDfileTex.path}`)

    try {
      const originalChapterFilesArray = (
        await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcard(false)))
      ).sort()

      cli.action.start('Compiling and generating output files'.actionStartColor())

      let fullOriginalContent = this.softConfig.globalMetadataContent

      const readmeFile = path.join(this.rootPath, 'readme.md')
      if ((await this.fsUtils.fileExists(readmeFile))) {
        fullOriginalContent += '\n' + (await this.fsUtils.readFileContent(readmeFile))
      }

      const bootstrapChptr = new BootstrapChptr(this.rootPath)

      for (const file of originalChapterFilesArray) {
        fullOriginalContent += '\n'
        const chapterContent = await this.fsUtils.readFileContent(file)
        if (withSummaries) {
          const number = this.softConfig.extractNumber(file)
          const chapterId = new ChapterId(number, false)

          const summaryFile = (
            await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(chapterId)))
          )[0]
          const summaryContent = await this.fsUtils.readFileContent(summaryFile)
          // const summaryRE = /^(?!# )(?!{{\d+}})(.+)$/gm
          const summaryRE = /^(?!# )(.+)$/gm
          fullOriginalContent += summaryContent.replace(/^{{\d+}}$/gm, '').replace(summaryRE, '> *$1*')
          fullOriginalContent += '\n\n````\n'

          const metadataFile = (
            await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.metadataWildcardWithNumber(chapterId)))
          )[0]
          const metadataContent = await this.fsUtils.readFileContent(metadataFile)
          const metadataObj = this.softConfig.parsePerStyle(metadataContent)
          let filteredMetadataObj: any = bootstrapChptr.deepCopy(metadataObj)

          fullOriginalContent += yaml.safeDump(filteredMetadataObj) //.replace(/\n/g, '\n\n')
          fullOriginalContent += '````\n\n'

          const chapterRE = /# (.*)\n/
          fullOriginalContent += chapterContent.replace(chapterRE, '***\n')
        } else {
          fullOriginalContent += chapterContent
        }
      }
      const fullCleanedOrTransformedContent = removeMarkup
        ? this.markupUtils.cleanMarkupContent(fullOriginalContent)
        : this.markupUtils.transformMarkupContent(fullOriginalContent)
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

      let chapterFiles = '"' + tmpMDfile.path + '" '

      const pandocRuns: Promise<string>[] = []
      const allOutputFilePath: string[] = []
      const allLuaFilters = await this.fsUtils.listFiles(path.join(this.hardConfig.configPath, '*.all.lua'))

      for (const filetype of outputFiletype) {
        const fullOutputFilePath = path.join(this.softConfig.buildDirectory, outputFile + '.' + filetype)
        allOutputFilePath.push(fullOutputFilePath)

        let pandocArgs: string[] = ['--strip-comments', '--from', 'markdown+emoji']

        if (filetype === 'md') {
          pandocArgs = pandocArgs.concat([
            // '--number-sections',
            '--to',
            'markdown-raw_html+smart+fancy_lists',
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
            'docx+smart+fancy_lists+fenced_divs',
            '--toc',
            '--toc-depth',
            '1',
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
            'html5+smart+fancy_lists',
            '--toc',
            '--toc-depth',
            '1',
            '--top-level-division=chapter',
            // '--number-sections',
            '--self-contained'
          ])
        }

        if (filetype === 'pdf' || filetype === 'tex') {
          chapterFiles = '"' + tmpMDfileTex.path + '" '

          const templateFullPath = path.join(this.hardConfig.configPath, 'template.latex')
          if (await this.fsUtils.fileExists(templateFullPath)) {
            pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
          } else {
            cli.warn(`For a better output, create a latex template at ${templateFullPath}`)
          }

          pandocArgs = pandocArgs.concat(await this.luaFilters('*.latex.lua', allLuaFilters))
          // const luaFilePaths = (await this.fsUtils.listFiles(path.join(this.hardConfig.configPath, '*.latex.lua'))).concat(allLuaFilters)
          // // this.fsUtils.getAllFilesForWildcards(['*.lua'], this.hardConfig.configPath)
          // for (const luaFilePath of luaFilePaths) {
          //   pandocArgs = pandocArgs.concat([`--lua-filter="${path.join(luaFilePath)}"`])
          //   debug(`lua-flter="${path.join(luaFilePath)}"`)
          // }

          pandocArgs = pandocArgs.concat([
            // '--listings',
            // '--fenced_code_blocks',
            '--toc',
            '--toc-depth',
            '1',
            '--top-level-division=chapter',
            // '--number-sections',
            '--pdf-engine=xelatex',
            '--to',
            'latex+raw_tex+smart+fancy_lists-emoji'
          ])
        } else {
          chapterFiles = '"' + tmpMDfile.path + '" '
        }

        if (filetype === 'epub') {
          pandocArgs = pandocArgs.concat([
            '--to',
            'epub+smart+fancy_lists',
            '--toc',
            '--toc-depth',
            '1',
            '--top-level-division=chapter'
            // '--number-sections'
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

        pandocArgs = [
          chapterFiles,
          // '--smart',
          '--standalone',
          '-o',
          `"${fullOutputFilePath}"`
        ].concat(pandocArgs)

        pandocRuns.push(this.runPandoc(pandocArgs))
        // await this.runPandoc(pandocArgs).catch(async err => {
        //   await this.fsUtils.createFile(tempMdFilePath, fullCleanedOrTransformedContent)
        //   throw new ChptrError(
        //     `Error trying to run Pandoc.  You need to have it installed and accessible globally, with version 2.7.3 minimally.\nLook into ${tempMdFilePath.toString()} with following error:\n${err
        //       .toString()
        //       .errorColor()}\nYou can delete temp file afterwards.`,
        //     'command:build:index',
        //     52
        //   )
        // })
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
  private async runPandoc(options: string[]): Promise<string> {
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

  private async addDigitsToFiles(files: string[], newDigitNumber: number, atNumberingStack: boolean): Promise<boolean> {
    const promises: Promise<MoveSummary>[] = []
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
          promises.push(this.gitUtils.mv(fromFilename, toFilename))
          hasMadeChanges = true
        }
      }
    }
    const aForAtNumbering = await this.moveChapterNumbersInFileContentToTemp(filesWithInfo.map(fwi => fwi.file))
    await this.moveChapterNumbersInFileContentToDestination(filesWithInfo, aForAtNumbering)

    await Promise.all(promises)
    await this.fsUtils.deleteEmptySubDirectories(this.rootPath)

    table.show('Adding digits to files')
    return hasMadeChanges
  }
}
