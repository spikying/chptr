import { ux } from '@oclif/core'
import { applyChange, diff, observableDiff } from 'deep-diff'
import * as JsDiff from 'diff'
import * as moment from 'moment'
import * as path from 'node:path'
import { Inject, InjectValue, Singleton } from 'typescript-ioc'

import { ChapterId } from './chapter-id'
import { ChptrError } from './chptr-error'
import { FsUtils } from './fs-utils'
import { GitUtils } from './git-utils'
import { SoftConfig, WordCountObject } from './soft-config'
import { ITable, tableize } from './ui-utils'
import { actionStartColor, actionStopColor } from './colorize'

const debug = require('debug')('markup-utils')

@Singleton
export class MarkupUtils {
  public readonly paragraphBreakChar = '' // '\u000D'// '\u200D' // '\u2028'
  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u2029'
  public titleRegex = /^\n# (.*?)\n/

  private readonly fsUtils: FsUtils
  // private readonly propRegex = /(?:{{(\d+)}}\n)?(.*?)(?<!{){([^:,.!\n{}]+?)}(?!})/gm
  // private readonly propRegex = /(?<!{){([^:,.!\n{}]+?)}(?!})/gm

  private readonly gitUtils: GitUtils
  private readonly propRegex = /(?<!{){([^\n!,.:{]+?)}(?!})/gm
  private readonly rootPath: string
  private readonly softConfig: SoftConfig

  constructor(
    @Inject softConfig: SoftConfig,
    @InjectValue('rootPath') rootPath: string,
    @Inject fsUtils: FsUtils,
    @Inject gitUtils: GitUtils
  ) {
    this.fsUtils = fsUtils
    this.softConfig = softConfig
    this.rootPath = rootPath
    this.gitUtils = gitUtils
  }

  public combineChapterAndSummaryMetadata(flattenedChapterMarkupArray: MarkupObj[], flattenedSummaryMarkupArray: MarkupObj[]): MarkupObj[] {
    return flattenedChapterMarkupArray.concat(
      flattenedSummaryMarkupArray.map(s => {
        const summaryNum = this.softConfig.extractNumber(s.filename)
        const summaryAtNumbering = this.softConfig.isAtNumbering(s.filename)

        const chapterFilename = flattenedChapterMarkupArray.find(c => {
          const chapterNum = this.softConfig.extractNumber(c.filename)
          const chapterAtNumbering = this.softConfig.isAtNumbering(c.filename)

          return chapterNum === summaryNum && chapterAtNumbering === summaryAtNumbering
        })!.filename
        s.filename = chapterFilename
        s.summary = true
        return s
      })
    )
  }

  public async extractMarkupAndUpdateGlobalAndChapterMetadata(
    allChapterFilesArray: string[],
    allSummaryFilesArray: string[],
    outputFile: string
  ) {
    ux.action.start(actionStartColor('Extracting markup and updating metadata'))
    // debug(`starting extractGlobalMetadata`)

    const flattenedChapterMarkupArray = await this.extractMarkupFromFiles(allChapterFilesArray)
    const flattenedSummaryMarkupArray = await this.extractMarkupFromFiles(allSummaryFilesArray)
    const flattenedMarkupArray = await this.combineChapterAndSummaryMetadata(flattenedChapterMarkupArray, flattenedSummaryMarkupArray)
    await this.updateGlobalAndChapterMetadata(flattenedMarkupArray, outputFile)

    ux.action.stop(actionStopColor(`done`))
  }

  public async extractMarkupFromFile(filepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []

    // debug(`in ExtractMarkup; filePath=${filepath}`)

    // try {
    const isAtNumbering = this.softConfig.isAtNumbering(filepath)
    const summary = this.softConfig.summaryRegex(isAtNumbering).test(filepath)
    const initialContent = await this.fsUtils.readFileContent(path.join(this.rootPath, filepath))
    const markupRegex = /(?:{{(\d+)}}\n)|{([^}]*?)\s?:\s?(.*?)}/gm
    const propRegex = /(?:{{(\d+)}}\n)|{([^\n!,.:{}]+?)}/gm

    let regexArray: RegExpExecArray | null
    let paraCounter = 1
    while ((regexArray = markupRegex.exec(initialContent)) !== null) {
      if (regexArray[1]) {
        paraCounter = Number.parseInt(regexArray[1], 10)
      } else {
        resultArray.push({
          computed: false,
          filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
          paragraph: paraCounter,
          summary,
          type: regexArray[2].toLowerCase(),
          value: regexArray[3]
        })
      }
    }

    paraCounter = 1
    while ((regexArray = propRegex.exec(initialContent)) !== null) {
      if (regexArray[1]) {
        paraCounter = Number.parseInt(regexArray[1], 10)
      } else {
        const propValue = this.softConfig.getFinalPropFor(regexArray[2])
        resultArray.push({
          computed: false,
          filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
          paragraph: paraCounter,
          summary,
          type: 'prop',
          value: propValue
        })
      }
    }

    const wordCount = this.GetWordCount(initialContent)
    resultArray.push({
      computed: true,
      filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
      summary,
      type: summary ? 'summaryWordCount' : 'wordCount',
      value: wordCount
    })
    const title = (await this.extractTitleFromString(initialContent)) || '###'
    resultArray.push({
      computed: true,
      filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
      summary,
      type: 'title',
      value: title
    })
    // } catch (err) {
    //   throw new ChptrError(err.toString().errorColor())
    // }

    // debug(`end of extractMarkup.  result=${JSON.stringify(resultArray)}`)
    return resultArray
  }

  public async extractMarkupFromFiles(allFilesArray: string[]): Promise<MarkupObj[]> {
    const extractPromises: Promise<MarkupObj[]>[] = []
    for (const cf of allFilesArray) {
      extractPromises.push(this.extractMarkupFromFile(cf))
    }

    return Promise.all(extractPromises).then(fullMarkupArray => {
      const flattenedMarkupArray: MarkupObj[] = ([] as MarkupObj[]).concat(...fullMarkupArray)

      return flattenedMarkupArray
    })
  }

  public extractTitleFromString(initialContent: string): null | string {
    const match = this.titleRegex.exec(initialContent)
    if (match) {
      return match[1]
    }

    return null
  }

  public async extractWordCountHistory2(recalculateWritingRate: boolean): Promise<WordCountObject[]> {
    const wordCountData = this.softConfig.WordCountData
    debug(`wordCountData = ${JSON.stringify(wordCountData)}`)
    const dateSortAscFunction = (a: { date: moment.Moment }, b: { date: moment.Moment }) =>
      a.date.valueOf() < b.date.valueOf() ? -1 : a.date.valueOf() > b.date.valueOf() ? 1 : 0

    const today = moment(moment().toDate())
    const daysFromToday =
      recalculateWritingRate || wordCountData.length < 3
        ? 0
        : today.diff(wordCountData.sort((a, b) => -dateSortAscFunction(a, b))[2].date.toDate(), 'days')
    // debug(`day diffed from today=${wordCountData.sort((a, b) => -dateSortAscFunction(a, b))[2].date.toDate()}`)
    debug(`daysFromToday=${daysFromToday}`)
    const allDatedContentFiles = (await this.gitUtils.GetGitListOfHistoryFiles(daysFromToday)).sort(dateSortAscFunction)

    // const value: WordCountObject[] = []
    let tempChapterTotal = 0
    let tempSummaryTotal = 0

    // TODO: refactor with .map.reduce?
    for (const datedFiles of allDatedContentFiles) {
      debug(`DateFiles.date=${datedFiles.date.toJSON()}`)
      let wcChapterTotalForDay = 0
      let wcSummaryTotalForDay = 0
      for (const file of datedFiles.chapterFiles) {
        const content = await this.gitUtils.GetGitContentOfHistoryFile(datedFiles.hash, file)
        const wordCount = this.GetWordCount(content)
        // debug(`file:${file} wordCount=${wordCount}`)
        wcChapterTotalForDay += wordCount
      }

      for (const file of datedFiles.summaryFiles) {
        const content = await this.gitUtils.GetGitContentOfHistoryFile(datedFiles.hash, file)
        const wordCount = this.GetWordCount(content)
        wcSummaryTotalForDay += wordCount
      }

      const indexOfDate = wordCountData.map(wc => wc.date.format('YYYY-MM-DD')).indexOf(datedFiles.date.format('YYYY-MM-DD'))
      const wordCountForDate: WordCountObject = {
        date: datedFiles.date,
        wordCountChapterDiff: wcChapterTotalForDay - tempChapterTotal,
        wordCountChapterTotal: wcChapterTotalForDay,
        wordCountSummaryDiff: wcSummaryTotalForDay - tempSummaryTotal,
        wordCountSummaryTotal: wcSummaryTotalForDay
      }
      debug(`indexOfDate=${indexOfDate}`)
      debug(`wordCountData[indexOfDate]=${JSON.stringify(wordCountData[indexOfDate])}`)
      debug(`wordCountForDate=${JSON.stringify(wordCountForDate)}`)
      if (indexOfDate === -1) {
        wordCountData.push(wordCountForDate)
      } else if (tempChapterTotal > 0 || tempSummaryTotal > 0) {
        wordCountData[indexOfDate] = wordCountForDate
      }

      tempChapterTotal = wcChapterTotalForDay
      tempSummaryTotal = wcSummaryTotalForDay
    }

    this.softConfig.WordCountData = wordCountData
    const maxFive = Math.max(wordCountData.length - 5, 0)
    return wordCountData.sort(dateSortAscFunction).slice(maxFive)
  }

  // public async extractWordCountHistory(filepath: string, extractAll: boolean): Promise<WordCountHistoryObj[]> {
  //   const logListArray = await this.gitUtils.GetGitListOfVersionsOfFile(filepath, extractAll)

  //   const logList = logListArray.map(l => {
  //     const wcRegex = /^([+-])\s*\"wordCount\": (\d+)/
  //     // const diffArray = s.length === 2 ? s[1].split('\n').filter(n => n !== '' && wcRegex.test(n)) : []
  //     const diffArray = l.content.split('\n').filter(n => n !== '' && wcRegex.test(n)) //|| []
  //     // debug(`diffArray=${JSON.stringify(diffArray)}`)
  //     const wordCountDiff = diffArray
  //       .map(d => {
  //         const match = wcRegex.exec(d)
  //         return match ? parseInt(`${match[1]}${match[2]}`, 10) : 0
  //       })
  //       .reduce((previous, current) => {
  //         return previous + current
  //       }, 0)

  //     return { log: l, wordCountDiff }
  //   })
  //   // debug(`logList = ${JSON.stringify(logList)}`)
  //   return logList
  // }

  public getMarkupByFile(flattenedMarkupArray: MarkupObj[]): MarkupByFile {
    return flattenedMarkupArray.reduce((cumul, markup) => {
      cumul[markup.filename] = cumul[markup.filename] || []
      if (markup.summary) {
        const rec = { computed: false, summary: true, type: markup.type, value: markup.value }
        if (!cumul[markup.filename].find(value => value.summary == rec.summary && rec.type == markup.type && value.value == markup.value)) {
          cumul[markup.filename].push(rec)
        }
      } else if (markup.computed) {
        cumul[markup.filename].push({ computed: true, summary: false, type: markup.type, value: markup.value })
      } else {
        const existingValue = cumul[markup.filename].find(
          value => value.summary == false && value.computed == false && value.type == markup.type && value.value == markup.value
        )
        if (existingValue && markup.paragraph) {
          const existing = existingValue.paragraph
            ? Array.isArray(existingValue.paragraph)
              ? existingValue.paragraph
              : [existingValue.paragraph]
            : []
          if (!existing.includes(markup.paragraph)) {
            existingValue.paragraph = [...existing, markup.paragraph]
          }
        } else {
          cumul[markup.filename].push({
            computed: false,
            paragraph: markup.paragraph,
            summary: false,
            type: markup.type,
            value: markup.value
          })
        }
      }

      return cumul
    }, {} as MarkupByFile)
  }

  public getMarkupByType(flattenedMarkupArray: MarkupObj[]): any {
    return flattenedMarkupArray.reduce((cumul, markup) => {
      if (markup.computed) {
        if (markup.type === 'wordCount') {
          cumul.totalWordCount = cumul.totalWordCount || 0
          cumul.totalWordCount += markup.value
        }
      } else {
        cumul[markup.type] = cumul[markup.type] || {}
        cumul[markup.type][markup.value] = cumul[markup.type][markup.value] || []
        const existingValue = cumul[markup.type][markup.value].find(
          (value: { filename: string; paragraph: number | number[]; summary: boolean }) =>
            value.summary == markup.summary && value.filename == markup.filename
        )
        if (existingValue) {
          const existing = existingValue.paragraph
            ? Array.isArray(existingValue.paragraph)
              ? existingValue.paragraph
              : [existingValue.paragraph]
            : []
          if (!existing.includes(markup.paragraph)) {
            existingValue.paragraph = [...existing, markup.paragraph]
          }
        } else {
          cumul[markup.type][markup.value].push({ filename: markup.filename, paragraph: markup.paragraph, summary: markup.summary })
        }
      }

      return cumul
    }, {} as any)
  }

  public GetUpdatedMetadataFieldsFromDefaults(
    initialObj: any,
    filename?: string,
    table?: ITable
  ): { changeApplied: boolean; replacedObj: any } {
    const replacedObj = JSON.parse(JSON.stringify(initialObj)) // used to create deep copy

    let changeApplied = false
    observableDiff(replacedObj.manual, this.softConfig.metadataFieldsDefaults, d => {
      if ((d.kind === 'D' && d.lhs === '') || d.kind === 'N') {
        changeApplied = true
        applyChange(replacedObj.manual, this.softConfig.metadataFieldsDefaults, d)
      }
    })
    if (changeApplied && filename && table) {
      const diffs = diff(initialObj.manual, replacedObj.manual) || []
      diffs.map(d => {
        const expl = (d.kind === 'N' ? 'New ' : 'Deleted ') + d.path
        // table.accumulator(this.softConfig.mapFileToBeRelativeToRootPath(file), expl)
        table.accumulator(filename, expl)
      })
    }

    return { changeApplied, replacedObj }
  }

  public GetWordCount(text: string): number {
    const wordRegex = require('word-regex')
    const cleanedText = this.transformToProdMarkupContent(text)
    const match = cleanedText.match(wordRegex())
    const wordCount = match ? match.length : 0
    return wordCount
  }

  public transformToDevMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{(\\d+)}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')
    let markupCounter = 0

    const transformInFootnote = function (initial: string): { didReplacement: boolean; replaced: string } {
      let didReplacement = false
      const replaced = initial.replace(/(?<!{){([^:}]+?)\s?:\s?(.+?)} ?(.*)$/m, (_full, one, two, three) => {
        markupCounter++
        didReplacement = didReplacement || (one && two)
        const after = three.length > 0 ? ` ${three}` : ''
        return `^_${one}:_^[^z${markupCounter}]${after}\n\n[^z${markupCounter}]: **${one.toUpperCase()}**: ${two}\n\n`
      })
      return { didReplacement, replaced }
    }

    let replacedContent = initialContent
      .replaceAll(/—/gm, '--')
      .replace(paragraphBreakRegex, '^_($1)_^\t')
      .replaceAll(/^### (.*)$/gm, '* * *\n\n## $1')
      .replaceAll(/^\\(.*)$/gm, '_% $1_')
      .replace(this.propRegex, '**$1**')
      // .replace(this.propRegex, '$2**$3**')
      .replace(sentenceBreakRegex, '  ')

    let continueReplacing = true
    while (continueReplacing) {
      const { didReplacement, replaced } = transformInFootnote(replacedContent)
      replacedContent = replaced
      continueReplacing = didReplacement
    }

    return replacedContent
  }

  public transformToPreProdMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{(\\d+)}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')

    const replacedContent = initialContent
      .replaceAll(/—/gm, '--')
      .replace(paragraphBreakRegex, '^_($1)_^\t')
      .replaceAll(/ {[^}]+?:.+?}([!"*,.:;?…])/gm, '$1') // remove note, end of sequence
      .replaceAll(/ ?{[^}]+?:.+?} ?/gm, ' ') // remove note
      .replace(sentenceBreakRegex, '  ')
      .replaceAll(/^### (.*)$/gm, '* * *')
      .replaceAll(/^\\(.*)$/gm, '_% $1_')
      .replace(this.propRegex, '$1')

    return replacedContent
  }

  public transformToProdMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{\\d+}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')

    // var mkString = new MarkupString(initialContent)

    const replacedContent = initialContent // mkString
      .replaceAll(/—/gm, '--')
      .replace(paragraphBreakRegex, '')
      .replaceAll(/ {[^}]+?:.+?}([!"*,.:;?…])/gm, '$1')
      .replaceAll(/ ?{[^}]+?:.+?} ?/gm, ' ')
      .replace(sentenceBreakRegex, '  ')
      .replaceAll(/^### (.*)$/gm, '* * *')
      .replaceAll(/^\\(.*)$/gm, '_% $1_')
      .replace(this.propRegex, '$1')

    return replacedContent
  }

  public async UpdateAllMetadataFieldsFromDefaults(): Promise<void> {
    const allMetadataFiles = await this.softConfig.getAllMetadataFiles()
    const table = tableize('file', 'changes')
    for (const file of allMetadataFiles) {
      // debug(`file=${file}`)
      const initialContent = await this.fsUtils.readFileContent(file)
      try {
        const initialObj = this.softConfig.parsePerStyle(initialContent)

        const { changeApplied, replacedObj } = this.GetUpdatedMetadataFieldsFromDefaults(
          initialObj,
          this.softConfig.mapFileToBeRelativeToRootPath(file),
          table
        )

        if (changeApplied) {
          const outputString = this.softConfig.stringifyPerStyle(replacedObj)
          await this.fsUtils.writeFile(file, outputString)
        }
        // const replacedObj = JSON.parse(JSON.stringify(initialObj)) //used to create deep copy

        // let changeApplied = false
        // observableDiff(replacedObj.manual, this.softConfig.metadataFieldsDefaults, d => {
        //   if ((d.kind === 'D' && d.lhs === '') || d.kind === 'N') {
        //     changeApplied = true
        //     applyChange(replacedObj.manual, this.softConfig.metadataFieldsDefaults, d)
        //   }
        // })
        // if (changeApplied) {
        //   const diffs = diff(initialObj.manual, replacedObj.manual) || []
        //   diffs.map(d => {
        //     const expl = (d.kind === 'N' ? 'New ' : 'Deleted ') + d.path
        //     table.accumulator(this.softConfig.mapFileToBeRelativeToRootPath(file), expl)
        //   })
        //   const outputString = this.softConfig.stringifyPerStyle(replacedObj)

        //   await this.fsUtils.writeFile(file, outputString)
        // }
      } catch (error) {
        throw new ChptrError(
          `Error in updating all chapter's Metadata files.  ${error}`,
          'markup-utils.updateallmetadatafieldsfromdefaults',
          23
        )
      }
    }

    table.show('Metadata fields updated in files')
  }

  public async updateGlobalAndChapterMetadata(flattenedMarkupArray: MarkupObj[], outputFile: string) {
    const table = tableize('file', 'diff')
    const markupByFile = this.getMarkupByFile(flattenedMarkupArray)
    const markupByType = this.getMarkupByType(flattenedMarkupArray)

    const markupExt = this.softConfig.configStyle.toLowerCase()
    const allMarkups = [
      { fullPath: path.join(this.softConfig.buildDirectory, `${outputFile}.markupByFile.${markupExt}`), markupObj: markupByFile },
      { fullPath: path.join(this.softConfig.buildDirectory, `${outputFile}.markupByType.${markupExt}`), markupObj: markupByType }
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
      modifiedMetadataFiles.map(val => ({ from: this.softConfig.mapFileToBeRelativeToRootPath(val.file), to: 'updated' })) // to: val.diff
    )

    table.show()
  }

  public async UpdateSingleMetadata(chapterFile: string) {
    debug(`Update single metadata for ${chapterFile}`)
    ux.action.start(`Extracting markup from ${chapterFile}`) //.actionStartColor())

    debug('will extract markup from file')
    const markupObjArr = await this.extractMarkupFromFile(chapterFile)
    debug('will get markup by file')
    const markupByFile = this.getMarkupByFile(markupObjArr)
    debug('will write metadata in each file')
    const modifiedMetadataFiles = await this.writeMetadataInEachFile(markupByFile)
    const modifiedFile = modifiedMetadataFiles[0]
    debug(`modified file = ${JSON.stringify(modifiedFile)}`)

    const msg = modifiedFile ? actionStopColor(`updated ${modifiedFile.file} with ${modifiedFile.diff}`) : 'updated nothing'
    ux.action.stop(msg)
  }

  public async writeMetadataInEachFile(markupByFile: any): Promise<{ diff: string; file: string }[]> {
    const modifiedFiles: { diff: string; file: string }[] = []

    for (const file of Object.keys(markupByFile)) {
      const extractedMarkup: any = {}
      const computedMarkup: any = {}
      const summaryMarkup: any = {}
      const markupArray = markupByFile[file]
      // debug(`file: ${file} markupArray=${JSON.stringify(markupArray)}`)

      markupArray.forEach((markup: MarkupObj) => {
        if (markup.summary) {
          if (summaryMarkup[markup.type]) {
            if (!Array.isArray(summaryMarkup[markup.type])) {
              summaryMarkup[markup.type] = [summaryMarkup[markup.type]]
            }

            summaryMarkup[markup.type].push(markup.value)
          } else {
            summaryMarkup[markup.type] = markup.value
          }
        } else if (markup.computed) {
          computedMarkup[markup.type] = markup.value
        } else if (extractedMarkup[markup.type]) {
          if (!Array.isArray(extractedMarkup[markup.type])) {
            extractedMarkup[markup.type] = [extractedMarkup[markup.type]]
          }

          extractedMarkup[markup.type].push(markup.value)
        } else {
          extractedMarkup[markup.type] = markup.value
        }
      })

      const chapterId = new ChapterId(this.softConfig.extractNumber(file), this.softConfig.isAtNumbering(file))

      // bug: doesn't get filename if pattern has changed.
      const metadataFilename = await this.softConfig.getMetadataFilenameFromDirectorySearchFromParameters(chapterId)
      const metadataFilePath = path.join(this.rootPath, metadataFilename)
      const initialContent = await this.fsUtils.readFileContent(metadataFilePath)

      const initialObj = this.softConfig.parsePerStyle(initialContent)
      let updatedObj = JSON.parse(JSON.stringify(initialObj)) // used to create deep copy

      debug(`FILE: ${metadataFilename}`)
      for (const key in updatedObj.manual) {
        if (Object.prototype.hasOwnProperty.call(updatedObj.manual, key)) {
          const element = updatedObj.manual[key]

          debug(`key: ${key}`)
          if (Array.isArray(element) && typeof element[0] === 'object') {
            const hasEmptyObject = element.reduce((pv, cv) => {
              let isEmpty = true
              for (const fieldName in cv) {
                debug(`fieldName: ${fieldName}`)
                if (Object.prototype.hasOwnProperty.call(cv, fieldName)) {
                  const testedValue = cv[fieldName]
                  debug(`testedValue: ${testedValue}`)
                  if (testedValue) {
                    isEmpty = false
                  }
                }
              }

              return pv || isEmpty
            }, false)
            debug(
              `element: ${JSON.stringify(element)}\nlength: ${element.length}\nTrue or False: ${Boolean(
                element
              )}\nhasEmptyObject: ${hasEmptyObject}`
            )
            if (hasEmptyObject || element.length === 0) {
              debug(`(in array of object) deleted ${key}:${JSON.stringify(updatedObj.manual[key])}`)
              delete updatedObj.manual[key]
            }
          } else if (!element || (Array.isArray(element) && element.length === 0)) {
            debug(`(in else) deleted ${key}:${updatedObj.manual[key]}`)
            delete updatedObj.manual[key]
          }
        }
      }

      const updatedResult = this.GetUpdatedMetadataFieldsFromDefaults(updatedObj)
      updatedObj = updatedResult.replacedObj

      delete updatedObj.extracted

      updatedObj.extracted = extractedMarkup
      updatedObj.computed = computedMarkup
      updatedObj.summary = summaryMarkup

      const updatedContent = this.softConfig.stringifyPerStyle(updatedObj)

      if (initialContent !== updatedContent) {
        // debug(`metadataFilePath=${metadataFilePath} updatedContent=${updatedContent}`)
        await this.fsUtils.writeFile(metadataFilePath, updatedContent)
        // todo: move to deep-diff? at least test with yaml config files
        modifiedFiles.push({
          diff: JsDiff.diffJson(initialObj, updatedObj)
            .map(d => {
              let s = d.added ? `++ ${d.value.trim()}` : ''
              s += d.removed ? `-- ${d.value.trim()}` : ''
              return s
            })
            .filter(s => s.length > 0)
            .join('; '),
          file: metadataFilePath
        })
      }
    }

    return modifiedFiles
  }

  private async contentHasChangedVersusFile(filepath: string, content: string) {
    const existingFileContent = await this.fsUtils.readFileContent(filepath)
    return existingFileContent !== content
  }
}

export interface WordCountHistoryObj {
  log: {
    date: moment.Moment
    file: string
    hash: string
    subject: string
  }
  wordCountDiff: number
}

export interface MarkupObj {
  computed: boolean
  filename: string
  paragraph?: number
  summary: boolean
  type: string
  value: number | string
}

interface MarkupByFile {
  [filename: string]: [
    {
      computed?: boolean
      paragraph?: number | number[]
      summary?: boolean
      type: string
      value: number | string
    }
  ]
}

// interface WordCountsPerDay {
//   date: moment.Moment
//   wordCountTotalChapters: number
//   wordCountDiffChapters: number
//   wordCountTotalSummaries: number
//   wordCountDiffSummaries: number
// }

// class MarkupString extends String {

//   constructor(str: string) {
//     super(str);
//   }

//   sanitizeId = function(this: string): string {
//     return latinize(sanitize(this)).replace(' ', '-')
//   }

//   public indexIds = function (this : MarkupString): MarkupString {
//       return this.replace(/\n\[?([\w ()-]+?)\]? ?(?:{.+?})?\n\n: {4}(?=\w+)/gm, (match, one) => {
//         return `\n[${one}]{.definition #${one.sanitizeId()}}\n\n:    `
//       })
//     }

// }
