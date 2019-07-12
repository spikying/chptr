import { cli } from 'cli-ux'
import * as JsDiff from 'diff'
import * as minimatch from 'minimatch'
import * as path from 'path'

import Command, { d, fileExists, readFile, writeFile } from './base'

const debug = d('command:edit-save-base')

export default abstract class extends Command {
  static flags = {
    ...Command.flags
  }

  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u000D'// '\u200D' // '\u2028'
  public readonly paragraphBreakChar = '\u2029'

  async init() {
    await super.init()
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) {
      throw new Error('Directory is not a repository')
    }
  }

  public async processFile(filepath: string): Promise<void> {
    try {
      const initialContent = await this.readFileContent(filepath)

      const replacedContent = this.processContent(initialContent)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }
  }

  public async processFileBack(filepath: string): Promise<void> {
    try {
      const initialContent = await this.readFileContent(filepath)

      const replacedContent = this.processContentBack(initialContent)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }
  }

  public async readFileContent(filepath: string): Promise<string> {
    const buff = await readFile(filepath)
    const content = await buff.toString('utf8', 0, buff.byteLength)
    debug(`Reading filepath: ${filepath}\nContent:\n${content}`)
    return content
  }

  public processContent(initialContent: string): string {
    let paraCounter = 1
    // \u2028 = line sep  \u200D = zero width joiner
    const replacedContent = initialContent
      .replace(/([.!?…}"]) {2}([{A-ZÀ-Ú])/gm, '$1' + this.sentenceBreakChar + '\n$2')
      .replace(/([.!?…}"])\n{2}([{A-ZÀ-Ú])/gm, (_full, one, two) => {
        paraCounter++
        return `${one}\n\n${this.paragraphBreakChar}{{${paraCounter}}}\n${two}`
      })
    debug(`Processed content: \n${replacedContent.substring(0, 250)}`)
    return replacedContent
  }

  public processContentBack(initialContent: string): string {
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\n', 'g')
    const paragraphBreakRegex = new RegExp('\\n\\n' + this.paragraphBreakChar + '{{\\d+}}\\n', 'g')

    const replacedContent = initialContent
      .replace(sentenceBreakRegex, '  ')
      .replace(paragraphBreakRegex, '\n\n')
      .replace(/([.!?…}"]) +\n/g, '$1\n')
      .replace(/\n*$/, '\n')
    debug(`Processed back content: \n${replacedContent.substring(0, 250)}`)
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
        await this.git.push()
        await this.git.pull()

        debug(`commitSummary:\n${JSON.stringify(commitSummary)}`)
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
    debug(`git status\n${JSON.stringify(gitStatus, null, 4)}`)
    debug(`Number filter (header): ${numberFilter}`)

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
      // .concat(gitStatus.not_added.map(unQuote))
      .concat(gitStatus.deleted.map(unQuote))
      .concat(gitStatus.modified.map(unQuote))
      .concat(gitStatus.created.map(unQuote))
      .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
      .filter(onlyUnique)

    debug(`unfilteredFileList = ${JSON.stringify(unfilteredFileList)}`)
    return unfilteredFileList
      .filter(val => val !== '')
      .filter(val => {
        debug(`Number filter: ${numberFilter}`)
        debug(`Minimatch chapter: ${minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter || -1, atFilter || false))}`)
        debug(`Minimatch metadata: ${minimatch(val, this.configInstance.metadataWildcardWithNumber(numberFilter || -1, atFilter || false))}`)
        debug(`Minimatch summary: ${minimatch(val, this.configInstance.summaryWildcardWithNumber(numberFilter || 0 - 1, atFilter || false))}`)
        return numberFilter
          ? minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.configInstance.metadataWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.configInstance.summaryWildcardWithNumber(numberFilter, atFilter || false))
          : true
      })
  }

  public async processChapterFilesBeforeSaving(toStageFiles: string[]): Promise<void> {
    // cli.action.start('Reading and processing modified files')
    for (const filename of toStageFiles) {
      const fullPath = path.join(this.configInstance.projectRootPath, filename)
      const exists = await fileExists(fullPath)
      if (
        exists &&
        (this.configInstance.chapterRegex(false).test(path.basename(fullPath)) || this.configInstance.chapterRegex(true).test(path.basename(fullPath)))
      ) {
        await this.processFileBack(fullPath)
        await this.processFile(fullPath)
      }
    }
    // cli.action.stop(`done ${toStageFiles.join(' ')}`)
  }

  public async extractMarkup(chapterFilepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []
    try {
      const initialContent = await this.readFileContent(path.join(this.configInstance.projectRootPath, chapterFilepath))
      const markupRegex = /(?:{{(\d+)}}\n)?.*?{(.*?)\s?:\s?(.*?)}/gm
      let regexArray: RegExpExecArray | null
      while ((regexArray = markupRegex.exec(initialContent)) !== null) {
        resultArray.push({
          filename: path.basename(chapterFilepath),
          paragraph: parseInt(regexArray[1] || '1', 10),
          type: regexArray[2].toLowerCase(),
          value: regexArray[3],
          computed: false
        })
      }
      const wordCount = this.GetWordCount(initialContent)
      resultArray.push({
        filename: path.basename(chapterFilepath),
        type: 'wordCount',
        value: wordCount,
        computed: true
      })
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }

    return resultArray
  }
  public objectifyMarkupArray(flattenedMarkupArray: MarkupObj[]): { markupByFile: MarkupByFile; markupByType: any } {
    const markupByFile: MarkupByFile = {}
    const markupByType: any = {}

    flattenedMarkupArray.forEach(markup => {
      markupByFile[markup.filename] = markupByFile[markup.filename] || []
      if (markup.computed) {
        markupByFile[markup.filename].push({ computed: true, type: markup.type, value: markup.value })
      } else {
        markupByFile[markup.filename].push({ computed: false, paragraph: markup.paragraph, type: markup.type, value: markup.value })
      }

      if (!markup.computed) {
        markupByType[markup.type] = markupByType[markup.type] || []
        markupByType[markup.type].push({ filename: markup.filename, paragraph: markup.paragraph, value: markup.value })
      } else {
        if (markup.type === 'wordCount') {
          markupByType.totalWordCount = markupByType.totalWordCount || 0
          markupByType.totalWordCount += markup.value
        }
      }
    })
    return { markupByFile, markupByType }
  }

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

      const num = this.context.extractNumber(file)
      const isAt = this.configInstance.isAtNumbering(file)

      const metadataFilename = await this.context.getMetadataFilenameFromParameters(num, isAt)
      // const metadataFilePath = await this.overwriteMetadata(metadataFilename, extractedMarkup, computedMarkup)
      // if (metadataFilePath) { modifiedFiles.push(metadataFilePath) }

      const metadataFilePath = path.join(this.configInstance.projectRootPath, metadataFilename)
      const initialContent = await this.readFileContent(metadataFilePath)
      const obj = JSON.parse(initialContent)
      obj.extracted = extractedMarkup
      obj.computed = computedMarkup

      const updatedContent = JSON.stringify(obj, null, 4)
      if (initialContent !== updatedContent) {
        await writeFile(metadataFilePath, updatedContent)
        modifiedFiles.push({
          file: metadataFilePath,
          diff: JsDiff.diffWords(initialContent, updatedContent)
            .map(d => JSON.stringify(d))
            .join(', ')
        })
      }
    }
    return modifiedFiles
  }

  public cleanMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{\\d+}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')

    const replacedContent = initialContent
      .replace(paragraphBreakRegex, '')
      .replace(/{.*?:.*?} ?/gm, ' ')
      .replace(sentenceBreakRegex, '  ')

    return replacedContent
  }

  private GetWordCount(text: string): number {
    const wordRegex = require('word-regex')
    const cleanedText = this.cleanMarkupContent(text)
    const match = cleanedText.match(wordRegex())
    const wordCount = match ? match.length : 0
    debug(`WORD COUNT=${wordCount} of text:\n${cleanedText}`)
    return wordCount
  }
}

export interface MarkupObj {
  filename: string
  paragraph?: number
  type: string
  value: string | number
  computed: boolean
}

interface MarkupByFile {
  [filename: string]: [
    {
      paragraph?: number
      type: string
      value: string | number
      computed: boolean
    }
  ]
}
