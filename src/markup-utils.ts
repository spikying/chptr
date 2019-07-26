import { cli } from 'cli-ux'
import * as d from 'debug'
import { applyChange, diff, observableDiff } from 'deep-diff'
import * as JsDiff from 'diff'
import yaml = require('js-yaml')
import * as path from 'path'

import { ChapterId } from './chapter-id'
import { ChptrError } from './chptr-error'
import { FsUtils } from './fs-utils'
import { SoftConfig } from './soft-config'
import { tableize } from './ui-utils'

const debug = d('markup-utils')

export class MarkupUtils {
  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u000D'// '\u200D' // '\u2028'
  public readonly paragraphBreakChar = '\u2029'
  public titleRegex = /^\n# (.*?)\n/

  private readonly propRegex = /(?:{{(\d+)}}\n)?.*?(?<!{){([^:,.!\n{}]+?)}(?!})/gm
  // private readonly propRegex = /(?<!{){([^:,.!\n{}]+?)}(?!})/gm

  private readonly fsUtils: FsUtils
  private readonly rootPath: string
  private readonly softConfig: SoftConfig

  constructor(softConfig: SoftConfig, rootPath: string) {
    this.fsUtils = new FsUtils()
    this.softConfig = softConfig
    this.rootPath = rootPath
  }

  public async extractAndUpdateGlobalAndChapterMetadata(allChapterFilesArray: string[], outputFile: string) {
    cli.action.start('Extracting global metadata'.actionStartColor())
    debug(`starting extractGlobalMetadata`)

    const table = tableize('file', 'diff')
    const extractPromises: Promise<MarkupObj[]>[] = []
    allChapterFilesArray.forEach(cf => {
      extractPromises.push(this.extractMarkupFromChapterFile(cf))
    })

    await Promise.all(extractPromises).then(async fullMarkupArray => {
      const flattenedMarkupArray: MarkupObj[] = ([] as MarkupObj[]).concat(...fullMarkupArray)

      // const { markupByFile, markupByType } = this.objectifyMarkupArray(flattenedMarkupArray)
      const markupByFile = this.getMarkupByFile(flattenedMarkupArray)
      const markupByType = this.getMarkupByType(flattenedMarkupArray)

      const markupExt = this.softConfig.configStyle.toLowerCase()
      const allMarkups = [
        { markupObj: markupByFile, fullPath: path.join(this.softConfig.buildDirectory, `${outputFile}.markupByFile.${markupExt}`) },
        { markupObj: markupByType, fullPath: path.join(this.softConfig.buildDirectory, `${outputFile}.markupByType.${markupExt}`) }
      ]

      for (const markup of allMarkups) {
        debug(`markup.fullPath=${markup.fullPath}`)
        const comparedString = this.softConfig.stringifyPerStyle(markup.markupObj)

        if (await this.contentHasChangedVersusFile(markup.fullPath, comparedString)) {
          await this.fsUtils.writeFile(markup.fullPath, comparedString)
          table.accumulator(this.softConfig.mapFileToBeRelativeToRootPath(markup.fullPath), 'updated')
        }
      }

      const modifiedMetadataFiles = await this.writeMetadataInEachFile(markupByFile)
      table.accumulatorArray(
        modifiedMetadataFiles.map(val => ({ from: this.softConfig.mapFileToBeRelativeToRootPath(val.file), to: val.diff }))
      )
    })

    cli.action.stop(`done`.actionStopColor())
    table.show()
  }

  public async UpdateSingleMetadata(chapterFile: string) {
    cli.action.start('Extracting single metadata'.actionStartColor())

    const markupObjArr = await this.extractMarkupFromChapterFile(chapterFile)
    const markupByFile = this.getMarkupByFile(markupObjArr)
    const modifiedMetadataFiles = await this.writeMetadataInEachFile(markupByFile)
    const modifiedFile = modifiedMetadataFiles[0]

    cli.action.stop(`updated ${modifiedFile.file} with ${modifiedFile.diff}`.actionStopColor())
  }


  //TODO: could be private?
  public async contentHasChangedVersusFile(filepath: string, content: string) {
    const existingFileContent = await this.fsUtils.readFileContent(filepath)
    return existingFileContent !== content
  }

  public async extractMarkupFromChapterFile(chapterFilepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []

    debug(`in ExtractMarkup; chapterFilePath=${chapterFilepath}`)

    // try {
    const initialContent = await this.fsUtils.readFileContent(path.join(this.rootPath, chapterFilepath))
    const markupRegex = /(?:{{(\d+)}}\n)?.*?{([^}]*?)\s?:\s?(.*?)}/gm
    let regexArray: RegExpExecArray | null
    let paraCounter = 1
    while ((regexArray = markupRegex.exec(initialContent)) !== null) {
      paraCounter = regexArray[1] ? parseInt(regexArray[1], 10) : paraCounter
      resultArray.push({
        filename: this.softConfig.mapFileToBeRelativeToRootPath(chapterFilepath),
        paragraph: paraCounter,
        type: regexArray[2].toLowerCase(),
        value: regexArray[3],
        computed: false
      })
    }
    paraCounter = 1
    while ((regexArray = this.propRegex.exec(initialContent)) !== null) {
      paraCounter = regexArray[1] ? parseInt(regexArray[1], 10) : paraCounter
      resultArray.push({
        filename: this.softConfig.mapFileToBeRelativeToRootPath(chapterFilepath),
        paragraph: paraCounter,
        type: 'prop',
        value: regexArray[2],
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
    // } catch (err) {
    //   throw new ChptrError(err.toString().errorColor())
    // }

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

  public getMarkupByFile(flattenedMarkupArray: MarkupObj[]): MarkupByFile {
    return flattenedMarkupArray.reduce(
      (cumul, markup) => {
        cumul[markup.filename] = cumul[markup.filename] || []
        if (markup.computed) {
          cumul[markup.filename].push({ computed: true, type: markup.type, value: markup.value })
        } else {
          cumul[markup.filename].push({ computed: false, paragraph: markup.paragraph, type: markup.type, value: markup.value })
        }
        return cumul
      },
      {} as MarkupByFile
    )
  }
  public getMarkupByType(flattenedMarkupArray: MarkupObj[]): any {
    return flattenedMarkupArray.reduce(
      (cumul, markup) => {
        if (!markup.computed) {
          cumul[markup.type] = cumul[markup.type] || []
          cumul[markup.type].push({ filename: markup.filename, paragraph: markup.paragraph, value: markup.value })
        } else {
          if (markup.type === 'wordCount') {
            cumul.totalWordCount = cumul.totalWordCount || 0
            cumul.totalWordCount += markup.value
          }
        }
        return cumul
      },
      {} as any
    )
  }

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

      const chapterId = new ChapterId(this.softConfig.extractNumber(file), this.softConfig.isAtNumbering(file))

      //bug: doesn't get filename if pattern has changed.
      const metadataFilename = await this.softConfig.getMetadataFilenameFromDirectorySearchFromParameters(chapterId)
      const metadataFilePath = path.join(this.rootPath, metadataFilename)
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
        //todo: move to deep-diff? at least test with yaml config files
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
      .replace(this.propRegex, '$2')

    return replacedContent
  }

  public transformMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{(\\d+)}}\\n', 'g')
    let markupCounter = 0

    const transformInFootnote = function(initial: string): { replaced: string; didReplacement: boolean } {
      let didReplacement = false
      const replaced = initial.replace(/(.*){([^}]*?)\s?:\s?(.*?)} *(.*)$/m, (_full, one, two, three, four) => {
        markupCounter++
        didReplacement = didReplacement || (two && three)
        return `${one} ^_${two}: _^[^${markupCounter}]  ${four}\n\n[^${markupCounter}]: ${three}\n\n`
      })
      return { replaced, didReplacement }
    }

    let replacedContent = initialContent
      .replace(paragraphBreakRegex, '^_($1)_^\t')
      .replace(/^### (.*)$/gm, '* * *\n\n## $1')
      .replace(/^\\(.*)$/gm, '_% $1_')
      .replace(this.propRegex, '**$2**')

    let continueReplacing = true
    while (continueReplacing) {
      const { replaced, didReplacement } = transformInFootnote(replacedContent)
      replacedContent = replaced
      continueReplacing = didReplacement
    }

    return replacedContent
  }

  public GetWordCount(text: string): number {
    const wordRegex = require('word-regex')
    const cleanedText = this.cleanMarkupContent(text)
    const match = cleanedText.match(wordRegex())
    const wordCount = match ? match.length : 0
    return wordCount
  }

  public async UpdateAllMetadataFieldsFromDefaults(): Promise<void> {
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
        throw new ChptrError(
          `Error in updating all chapter's Metadata files.  ${err}`,
          'markup-utils.updateallmetadatafieldsfromdefaults',
          23
        )
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
