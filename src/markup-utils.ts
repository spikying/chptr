import { cli } from 'cli-ux'
import * as d from 'debug'
import { applyChange, diff, observableDiff } from 'deep-diff'
import * as JsDiff from 'diff'
import yaml = require('js-yaml')
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
  readonly softConfig: SoftConfig

  constructor(softConfig: SoftConfig) {
    this.fsUtils = new FsUtils()
    this.softConfig = softConfig
  }

  public async extractMarkup(chapterFilepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []

    debug(`in ExtractMarkup; chapterFilePath=${chapterFilepath}`)

    try {
      const initialContent = await this.fsUtils.readFileContent(path.join(this.softConfig.projectRootPath, chapterFilepath))
      const markupRegex = /(?:{{(\d+)}}\n)?.*?{(.*?)\s?:\s?(.*?)}/gm
      let regexArray: RegExpExecArray | null
      while ((regexArray = markupRegex.exec(initialContent)) !== null) {
        resultArray.push({
          filename: this.softConfig.mapFileToBeRelativeToRootPath(chapterFilepath),
          paragraph: parseInt(regexArray[1] || '1', 10),
          type: regexArray[2].toLowerCase(),
          value: regexArray[3],
          computed: false
        })
      }
      const wordCount = this.GetWordCount(initialContent)
      resultArray.push({
        filename: this.softConfig.mapFileToBeRelativeToRootPath(chapterFilepath),
        type: 'wordCount',
        value: wordCount,
        computed: true
      })
      const title = (await this.extractTitleFromString(initialContent)) || '###'
      resultArray.push({
        filename: this.softConfig.mapFileToBeRelativeToRootPath(chapterFilepath),
        type: 'title',
        value: title,
        computed: true
      })
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    debug(`end of extractMarkup.  result=${JSON.stringify(resultArray)}`)
    return resultArray
  }

  public extractTitleFromString(initialContent: string): string | null {
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
      debug(`file: ${file} markupArray=${JSON.stringify(markupArray)}`)

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

      const num = this.softConfig.extractNumber(file)
      const isAt = this.softConfig.isAtNumbering(file)

      //bug: doesn't get filename if pattern has changed.
      const metadataFilename = await this.softConfig.getMetadataFilenameFromDirectorySearchFromParameters(num, isAt)
      const metadataFilePath = path.join(this.softConfig.projectRootPath, metadataFilename)
      const initialContent = await this.fsUtils.readFileContent(metadataFilePath)

      const initialObj =
        this.softConfig.configStyle === 'JSON5'
          ? JSON.parse(initialContent)
          : this.softConfig.configStyle === 'YAML'
          ? yaml.safeLoad(initialContent)
          : {}
      const updatedObj = JSON.parse(JSON.stringify(initialObj)) //used to create deep copy
      updatedObj.extracted = extractedMarkup
      updatedObj.computed = computedMarkup

      const updatedContent =
        this.softConfig.configStyle === 'JSON5'
          ? JSON.stringify(updatedObj, null, 4)
          : this.softConfig.configStyle === 'YAML'
          ? yaml.safeDump(updatedObj)
          : ''
      if (initialContent !== updatedContent) {
        debug(`metadataFilePath=${metadataFilePath} updatedContent=${updatedContent}`)
        await this.fsUtils.writeFile(metadataFilePath, updatedContent)
        //todo: move to deep-diff?
        modifiedFiles.push({
          file: metadataFilePath,
          diff: JsDiff.diffJson(initialObj, updatedObj)
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
    const allMetadataFiles = await this.softConfig.getAllMetadataFiles()
    const table = tableize('file', 'changes')
    for (const file of allMetadataFiles) {
      debug(`file=${file}`)
      const initialContent = await this.fsUtils.readFileContent(file)
      try {
        const initialObj =
          this.softConfig.configStyle === 'JSON5'
            ? JSON.parse(initialContent)
            : this.softConfig.configStyle === 'YAML'
            ? yaml.safeLoad(initialContent)
            : {}
        const replacedObj =
          this.softConfig.configStyle === 'JSON5'
            ? JSON.parse(initialContent)
            : this.softConfig.configStyle === 'YAML'
            ? yaml.safeLoad(initialContent)
            : {}

        let changeApplied = false
        observableDiff(replacedObj.manual, this.softConfig.metadataFieldsDefaults, d => {
          if ((d.kind === 'D' && d.lhs === '') || d.kind === 'N') {
            changeApplied = true
            applyChange(replacedObj.manual, this.softConfig.metadataFieldsDefaults, d)
          }
        })
        if (changeApplied) {
          const diffs = diff(initialObj.manual, replacedObj.manual) || []
          diffs.map(d => {
            const expl = (d.kind === 'N' ? 'New ' : 'Deleted ') + d.path
            table.accumulator(this.softConfig.mapFileToBeRelativeToRootPath(file), expl)
          })
          const outputString =
            this.softConfig.configStyle === 'JSON5'
              ? JSON.stringify(replacedObj, null, 4)
              : this.softConfig.configStyle === 'YAML'
              ? yaml.safeDump(replacedObj)
              : ''
          await this.fsUtils.writeFile(file, outputString)
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
