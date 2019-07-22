import { cli } from 'cli-ux'
import * as d from 'debug'
import { applyChange, diff, observableDiff } from 'deep-diff'
import * as JsDiff from 'diff'
import * as path from 'path'

import { FsUtils } from './fs-utils'
import { SoftConfig } from './soft-config'
import { tableize } from './ui-utils'

const debug = d('markup-utils')

export class MarkupUtils {
  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u000D'// '\u200D' // '\u2028'
  public readonly paragraphBreakChar = '\u2029'
  public titleRegex = /^\n# (.*?)\n/

  readonly fsUtils: FsUtils
  readonly configInstance: SoftConfig

  constructor(configInstance: SoftConfig) {
    this.fsUtils = new FsUtils()
    this.configInstance = configInstance
  }

  public async extractMarkup(chapterFilepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []
    try {
      const initialContent = await this.fsUtils.readFileContent(path.join(this.configInstance.projectRootPath, chapterFilepath))
      const markupRegex = /(?:{{(\d+)}}\n)?.*?{(.*?)\s?:\s?(.*?)}/gm
      let regexArray: RegExpExecArray | null
      while ((regexArray = markupRegex.exec(initialContent)) !== null) {
        resultArray.push({
          filename: this.configInstance.mapFileToBeRelativeToRootPath(chapterFilepath),
          paragraph: parseInt(regexArray[1] || '1', 10),
          type: regexArray[2].toLowerCase(),
          value: regexArray[3],
          computed: false
        })
      }
      const wordCount = this.GetWordCount(initialContent)
      resultArray.push({
        filename: this.configInstance.mapFileToBeRelativeToRootPath(chapterFilepath),
        type: 'wordCount',
        value: wordCount,
        computed: true
      })
      const title = (await this.extractTitleFromString(initialContent)) || '###'
      resultArray.push({
        filename: this.configInstance.mapFileToBeRelativeToRootPath(chapterFilepath),
        type: 'title',
        value: title,
        computed: true
      })
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    return resultArray
  }

  public async extractTitleFromString(initialContent: string): Promise<string | null> {
    const match = this.titleRegex.exec(initialContent)
    if (match) {
      return match[1]
    } else {
      return null
    }
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

  public cleanMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{\\d+}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')

    const replacedContent = initialContent
      .replace(paragraphBreakRegex, '')
      .replace(/{.*?:.*?} ?/gm, ' ')
      .replace(sentenceBreakRegex, '  ')
      .replace(/^### (.*)$/gm, '* * *')
      .replace(/^\\(.*)$/gm, '_% $1_')

    return replacedContent
  }

  public GetWordCount(text: string): number {
    const wordRegex = require('word-regex')
    const cleanedText = this.cleanMarkupContent(text)
    const match = cleanedText.match(wordRegex())
    const wordCount = match ? match.length : 0
    return wordCount
  }

  public async UpdateAllMetadataFields(): Promise<void> {
    const allMetadataFiles = await this.configInstance.getAllMetadataFiles()
    const table = tableize('file', 'changes')
    for (const file of allMetadataFiles) {
      debug(`file=${file}`)
      const initialContent = await this.fsUtils.readFileContent(file)
      try {
        const initialObj = JSON.parse(initialContent)
        const replacedObj = JSON.parse(initialContent)

        let changeApplied = false
        observableDiff(replacedObj.manual, this.configInstance.metadataFieldsDefaults, d => {
          if ((d.kind === 'D' && d.lhs === '') || d.kind === 'N') {
            changeApplied = true
            applyChange(replacedObj.manual, this.configInstance.metadataFieldsDefaults, d)
          }
        })
        if (changeApplied) {
          const diffs = diff(initialObj.manual, replacedObj.manual) || []
          diffs.map(d => {
            const expl = (d.kind === 'N' ? 'New ' : 'Deleted ') + d.path
            table.accumulator(this.configInstance.mapFileToBeRelativeToRootPath(file), expl)
          })
          await this.fsUtils.writeFile(file, JSON.stringify(replacedObj, null, 4))
        }
      } catch (err) {
        debug(err.toString().errorColor())
      }
    }
    table.show('Metadata fields updated in files')
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
