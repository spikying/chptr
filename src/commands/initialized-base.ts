import { cli } from 'cli-ux'
import * as jsonComment from 'comment-json'
import { observableDiff } from 'deep-diff'
import * as JsDiff from 'diff'
import yaml = require('js-yaml')
import * as minimatch from 'minimatch'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

import { MarkupObj, MarkupUtils } from '../markup-utils'
import { SoftConfig } from '../soft-config'
import { Statistics } from '../statistics'
import { tableize } from '../ui-utils'

import Command, { d, sanitizeFileName } from './base'
const debug = d('command:initialized-base')

export default abstract class extends Command {
  public get configInstance(): SoftConfig {
    return this._configInstance as SoftConfig
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

  private _configInstance: SoftConfig | undefined
  private _statistics: Statistics | undefined
  private _markupUtils: MarkupUtils | undefined

  private _lastConfigObj: any
  private _actualConfigObj: any

  async init() {
    debug('init of initialized-base')
    await super.init()

    const { flags } = this.parse(this.constructor as any)
    const dir = path.join(flags.path as string)
    this._configInstance = new SoftConfig(dir)
    this._statistics = new Statistics(this.configInstance)
    this._markupUtils = new MarkupUtils(this._configInstance)

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

    await this.fsUtils.deleteEmptySubDirectories(this.configInstance.projectRootPath)
  }

  public async finally() {
    await super.finally()
    await this.fsUtils.deleteEmptySubDirectories(this.configInstance.projectRootPath)
  }

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

  public async CommitToGit(message: string, toStageFiles?: string[]) {
    toStageFiles = toStageFiles || (await this.GetGitListOfStageableFiles())
    if (toStageFiles.length > 0) {
      try {
        cli.action.start('Saving file(s) in repository'.actionStartColor())

        await this.processChapterFilesBeforeSaving(toStageFiles)

        await this.git.add(toStageFiles)
        await this.git.addConfig('user.name', this.configInstance.config.projectAuthor.name)
        await this.git.addConfig('user.email', this.configInstance.config.projectAuthor.email)

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
      .concat(gitStatus.deleted.map(unQuote))
      .concat(gitStatus.modified.map(unQuote))
      .concat(gitStatus.created.map(unQuote))
      .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
      .filter(onlyUnique)

    return unfilteredFileList
      .filter(val => val !== '')
      .filter(val => {
        return numberFilter
          ? minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.configInstance.metadataWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.configInstance.summaryWildcardWithNumber(numberFilter, atFilter || false))
          : true
      })
  }

  public async processChapterFilesBeforeSaving(toStageFiles: string[]): Promise<void> {
    for (const filename of toStageFiles) {
      const fullPath = path.join(this.configInstance.projectRootPath, filename)
      const exists = await this.fsUtils.fileExists(fullPath)
      if (
        exists &&
        (this.configInstance.chapterRegex(false).test(this.configInstance.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.configInstance.chapterRegex(true).test(this.configInstance.mapFileToBeRelativeToRootPath(fullPath)))
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

  // public async extractMarkup(chapterFilepath: string): Promise<MarkupObj[]> {
  //   const resultArray: MarkupObj[] = []
  //   try {
  //     const initialContent = await this.fsUtils.readFileContent(path.join(this.configInstance.projectRootPath, chapterFilepath))
  //     const markupRegex = /(?:{{(\d+)}}\n)?.*?{(.*?)\s?:\s?(.*?)}/gm
  //     let regexArray: RegExpExecArray | null
  //     while ((regexArray = markupRegex.exec(initialContent)) !== null) {
  //       resultArray.push({
  //         filename: this.configInstance.mapFileToBeRelativeToRootPath(chapterFilepath),
  //         paragraph: parseInt(regexArray[1] || '1', 10),
  //         type: regexArray[2].toLowerCase(),
  //         value: regexArray[3],
  //         computed: false
  //       })
  //     }
  //     const wordCount = this.GetWordCount(initialContent)
  //     resultArray.push({
  //       filename: this.configInstance.mapFileToBeRelativeToRootPath(chapterFilepath),
  //       type: 'wordCount',
  //       value: wordCount,
  //       computed: true
  //     })
  //     const title = (await this.extractTitleFromString(initialContent)) || '###'
  //     resultArray.push({
  //       filename: this.configInstance.mapFileToBeRelativeToRootPath(chapterFilepath),
  //       type: 'title',
  //       value: title,
  //       computed: true
  //     })
  //   } catch (err) {
  //     this.error(err.toString().errorColor())
  //     this.exit(1)
  //   }

  //   return resultArray
  // }

  // public objectifyMarkupArray(flattenedMarkupArray: MarkupObj[]): { markupByFile: MarkupByFile; markupByType: any } {
  //   const markupByFile: MarkupByFile = {}
  //   const markupByType: any = {}

  //   flattenedMarkupArray.forEach(markup => {
  //     markupByFile[markup.filename] = markupByFile[markup.filename] || []
  //     if (markup.computed) {
  //       markupByFile[markup.filename].push({ computed: true, type: markup.type, value: markup.value })
  //     } else {
  //       markupByFile[markup.filename].push({ computed: false, paragraph: markup.paragraph, type: markup.type, value: markup.value })
  //     }

  //     if (!markup.computed) {
  //       markupByType[markup.type] = markupByType[markup.type] || []
  //       markupByType[markup.type].push({ filename: markup.filename, paragraph: markup.paragraph, value: markup.value })
  //     } else {
  //       if (markup.type === 'wordCount') {
  //         markupByType.totalWordCount = markupByType.totalWordCount || 0
  //         markupByType.totalWordCount += markup.value
  //       }
  //     }
  //   })
  //   return { markupByFile, markupByType }
  // }

  public async writeMetadataInEachFile(markupByFile: any): Promise<{ file: string; diff: string }[]> {
    const modifiedFiles: { file: string; diff: string }[] = []

    for (const file of Object.keys(markupByFile)) {
      const extractedMarkup: any = {}
      const computedMarkup: any = {}
      const markupArray = markupByFile[file]
      markupArray.forEach((markup: MarkupObj) => {
        if (markup.computed) {
          computedMarkup[markup.type] = markup.value
        } else {
          if (extractedMarkup[markup.type]) {
            if (!Array.isArray(extractedMarkup[markup.type])) {
              extractedMarkup[markup.type] = [extractedMarkup[markup.type]]
            }
            extractedMarkup[markup.type].push(markup.value)
          } else {
            extractedMarkup[markup.type] = markup.value
          }
        }
      })

      const num = this.configInstance.extractNumber(file)
      const isAt = this.configInstance.isAtNumbering(file)

      const metadataFilename = await this.configInstance.getMetadataFilenameFromParameters(num, isAt)
      const metadataFilePath = path.join(this.configInstance.projectRootPath, metadataFilename)
      const initialContent = await this.fsUtils.readFileContent(metadataFilePath)

      const obj = JSON.parse(initialContent)
      obj.extracted = extractedMarkup
      obj.computed = computedMarkup

      const updatedContent = JSON.stringify(obj, null, 4)
      if (initialContent !== updatedContent) {
        await this.fsUtils.writeFile(metadataFilePath, updatedContent)
        //todo: move to deep-diff?
        modifiedFiles.push({
          file: metadataFilePath,
          diff: JsDiff.diffJson(JSON.parse(initialContent), JSON.parse(updatedContent))
            .map(d => {
              let s = d.added ? `++ ${d.value.trim()}` : ''
              s += d.removed ? `-- ${d.value.trim()}` : ''
              return s
            })
            .filter(s => s.length > 0)
            .join('; ')
        })
      }
    }
    return modifiedFiles
  }

  // public cleanMarkupContent(initialContent: string): string {
  //   const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{\\d+}}\\n', 'g')
  //   const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')

  //   const replacedContent = initialContent
  //     .replace(paragraphBreakRegex, '')
  //     .replace(/{.*?:.*?} ?/gm, ' ')
  //     .replace(sentenceBreakRegex, '  ')
  //     .replace(/^### (.*)$/gm, '* * *')
  //     .replace(/^\\(.*)$/gm, '_% $1_')

  //   return replacedContent
  // }

  // public GetWordCount(text: string): number {
  //   const wordRegex = require('word-regex')
  //   const cleanedText = this.cleanMarkupContent(text)
  //   const match = cleanedText.match(wordRegex())
  //   const wordCount = match ? match.length : 0
  //   return wordCount
  // }

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
    const { tempDir, removeTempDir } = await this.fsUtils.getTempDir(this.configInstance.projectRootPath)
    const tempDirForGit = this.configInstance.mapFileToBeRelativeToRootPath(tempDir)

    for (const b of [true, false]) {
      const wildcards = [this.configInstance.chapterWildcard(b), this.configInstance.metadataWildcard(b), this.configInstance.summaryWildcard(b)]
      for (const wildcard of wildcards) {
        const files = await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, wildcard))

        const organizedFiles: any[] = []
        for (const file of files) {
          organizedFiles.push({ number: this.configInstance.extractNumber(file), filename: file })
        }

        const destDigits = this.statistics.getMaxNecessaryDigits(b)
        let currentNumber = this.configInstance.config.numberingInitial

        for (const file of organizedFiles.sort((a, b) => a.number - b.number)) {
          const fromFilename = this.configInstance.mapFileToBeRelativeToRootPath(file.filename)
          const toFilename = this.statistics.renumberedFilename(fromFilename, currentNumber, destDigits, b)

          if (fromFilename !== toFilename) {
            moves.push({ fromFilename, toFilename })
            table.accumulator(fromFilename, toFilename)
            movePromises.push(this.git.mv(fromFilename, path.join(tempDirForGit, toFilename)))
          }
          currentNumber += this.configInstance.config.numberingStep
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

  // public async UpdateAllMetadataFields(): Promise<void> {
  //   const allMetadataFiles = await this.configInstance.getAllMetadataFiles()
  //   const table = this.tableize('file', 'changes')
  //   for (const file of allMetadataFiles) {
  //     debug(`file=${file}`)
  //     const initialContent = await this.fsUtils.readFileContent(file)
  //     try {
  //       const initialObj = JSON.parse(initialContent)
  //       const replacedObj = JSON.parse(initialContent)

  //       let changeApplied = false
  //       observableDiff(replacedObj.manual, this.configInstance.metadataFieldsDefaults, d => {
  //         if ((d.kind === 'D' && d.lhs === '') || d.kind === 'N') {
  //           changeApplied = true
  //           applyChange(replacedObj.manual, this.configInstance.metadataFieldsDefaults, d)
  //         }
  //       })
  //       if (changeApplied) {
  //         const diffs = diff(initialObj.manual, replacedObj.manual) || []
  //         diffs.map(d => {
  //           const expl = (d.kind === 'N' ? 'New ' : 'Deleted ') + d.path
  //           table.accumulator(this.configInstance.mapFileToBeRelativeToRootPath(file), expl)
  //         })
  //         await this.fsUtils.writeFile(file, JSON.stringify(replacedObj, null, 4))
  //       }
  //     } catch (err) {
  //       debug(err.toString().errorColor())
  //     }
  //   }
  //   table.show('Metadata fields updated in files')
  // }

  public async RenameFilesIfNewPattern(): Promise<boolean> {
    let result = false
    const { lastConfigObj, actualConfigObj } = await this.getLastAndActualConfigObjects()

    const oldVsNew: { oldPattern: string; newPattern: string }[] = []
    observableDiff(lastConfigObj, actualConfigObj, d => {
      if (
        d.kind === 'E' &&
        d.path &&
        d.path.reduce((previous, current) => {
          return previous || current.indexOf('Pattern') > 0
        }, false)
      ) {
        const fileType = d.path && d.path[0]
        const oldPattern = d.lhs
        const newPattern = sanitizeFileName(d.rhs, true)
        debug(`fileType=${fileType}, oldPattern=${oldPattern}, newPattern=${newPattern}`)
        oldVsNew.push({ oldPattern, newPattern })
      }
    })

    debug(`old vs new: ${JSON.stringify(oldVsNew)}`)

    const movePromises: Promise<MoveSummary>[] = []
    for (const oldAndNew of oldVsNew) {
      const files = await this.configInstance.getAllFilesForPattern(oldAndNew.oldPattern)
      for (const file of files) {
        const reNormal = this.configInstance.patternRegexer(oldAndNew.oldPattern, false)
        const reAtNumber = this.configInstance.patternRegexer(oldAndNew.oldPattern, true)
        const isAtNumber = this.configInstance.isAtNumbering(file)
        const rootedFile = this.configInstance.mapFileToBeRelativeToRootPath(file)
        const num = rootedFile.replace(isAtNumber ? reAtNumber : reNormal, '$1')

        //TODO: get name from metadata file's title?  Here if old pattern has no name, it gives '$2' as a name.
        const name = rootedFile.replace(isAtNumber ? reAtNumber : reNormal, '$2')
        const renamedFile = oldAndNew.newPattern.replace(/NUM/g, (isAtNumber ? '@' : '') + num).replace(/NAME/g, name)

        await this.fsUtils.createSubDirectoryIfNecessary(path.join(this.configInstance.projectRootPath, renamedFile))

        result = true
        movePromises.push(this.git.mv(rootedFile, renamedFile))
      }
    }

    await Promise.all(movePromises)
    return result
  }

  public async getBuildDirectoryAndCreateIfNecessary(): Promise<string> {
    const buildDirectory = this.configInstance.buildDirectory

    await this.fsUtils.createSubDirectoryIfNecessary(path.join(this.configInstance.buildDirectory, 'config.file'))
    return buildDirectory
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
        newDir = sanitizeFileName(d.rhs, true)
      }
    })

    if (oldDir !== newDir) {
      const files = await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, oldDir, '**/*.*'))
      debug(`move to new build dir : files=${files}`)
      await this.fsUtils.createSubDirectoryIfNecessary(path.join(this.configInstance.projectRootPath, newDir, 'futureBuildDir.txt'))

      for (const file of files) {
        const newFile = path.relative(path.join(this.configInstance.projectRootPath, oldDir), file)
        await this.fsUtils.moveFile(file, path.join(this.configInstance.projectRootPath, newDir, newFile))
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

  private async getLastAndActualConfigObjects(): Promise<{ lastConfigObj: any; actualConfigObj: any }> {
    if (!this._lastConfigObj || !this._actualConfigObj) {
      const configFilePath =
        this.configInstance.configStyle === 'JSON5'
          ? this.hardConfig.configJSON5FilePath
          : this.configInstance.configStyle === 'YAML'
          ? this.hardConfig.configYAMLFilePath
          : ''
      const lastConfigContent = (await this.git.show([`HEAD:${this.configInstance.mapFileToBeRelativeToRootPath(configFilePath).replace(/\\/, '/')}`])) || '{}'

      const actualConfigContent = await this.fsUtils.readFileContent(configFilePath)

      this._lastConfigObj =
        this.configInstance.configStyle === 'JSON5' ? jsonComment.parse(lastConfigContent, undefined, true) : yaml.safeLoad(lastConfigContent)
      this._actualConfigObj =
        this.configInstance.configStyle === 'JSON5' ? jsonComment.parse(actualConfigContent, undefined, true) : yaml.safeLoad(actualConfigContent)
    }

    return { lastConfigObj: this._lastConfigObj, actualConfigObj: this._actualConfigObj }
  }

  private async addDigitsToFiles(files: string[], newDigitNumber: number, atNumberingStack: boolean): Promise<boolean> {
    const promises: Promise<MoveSummary>[] = []
    let hasMadeChanges = false
    const table = tableize('from', 'to')

    for (const file of files) {
      const filename = this.configInstance.mapFileToBeRelativeToRootPath(file)
      const atNumbering = this.configInstance.isAtNumbering(filename)

      if (atNumbering === atNumberingStack) {
        const filenumber = this.configInstance.extractNumber(file)
        const fromFilename = filename
        const toFilename = this.statistics.renumberedFilename(filename, filenumber, newDigitNumber, atNumbering)

        if (fromFilename !== toFilename) {
          await this.fsUtils.createSubDirectoryIfNecessary(path.join(this.configInstance.projectRootPath, toFilename))
          table.accumulator(fromFilename, toFilename)
          promises.push(this.git.mv(fromFilename, toFilename))
          hasMadeChanges = true
        }
      }
    }

    await this.fsUtils.deleteEmptySubDirectories(this.configInstance.projectRootPath)

    table.show('Adding digits to files')
    await Promise.all(promises)
    return hasMadeChanges
  }
}

// export interface MarkupObj {
//   filename: string
//   paragraph?: number
//   type: string
//   value: string | number
//   computed: boolean
// }

// interface MarkupByFile {
//   [filename: string]: [
//     {
//       paragraph?: number
//       type: string
//       value: string | number
//       computed: boolean
//     }
//   ]
// }
