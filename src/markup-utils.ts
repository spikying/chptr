import { cli } from 'cli-ux'
import * as d from 'debug'
import { applyChange, diff, observableDiff } from 'deep-diff'
import * as JsDiff from 'diff'
import * as moment from 'moment'
import * as path from 'path'

import { ChapterId } from './chapter-id'
import { ChptrError } from './chptr-error'
import { FsUtils } from './fs-utils'
import { GitUtils } from './git-utils'
import { SoftConfig, WordCountObject } from './soft-config'
import { tableize, ITable } from './ui-utils'
import { Singleton, Container } from 'typescript-ioc'
import { debugPort } from 'process'
import { inherits } from 'util'

const debug = d('markup-utils')

@Singleton
export class MarkupUtils {
  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u000D'// '\u200D' // '\u2028'
  public readonly paragraphBreakChar = '' // '\u2029'
  public titleRegex = /^\n# (.*?)\n/

  private readonly propRegex = /(?<!{){([^:,.!\n{]+?)}(?!})/gm
  // private readonly propRegex = /(?:{{(\d+)}}\n)?(.*?)(?<!{){([^:,.!\n{}]+?)}(?!})/gm
  // private readonly propRegex = /(?<!{){([^:,.!\n{}]+?)}(?!})/gm

  private readonly fsUtils: FsUtils
  private readonly rootPath: string
  private readonly softConfig: SoftConfig
  private readonly gitUtils: GitUtils

  constructor(softConfig: SoftConfig, rootPath: string) {
    this.fsUtils = new FsUtils()
    this.softConfig = softConfig
    this.rootPath = rootPath
    this.gitUtils = Container.get(GitUtils) // new GitUtils(softConfig, rootPath)
  }

  public async extractMarkupAndUpdateGlobalAndChapterMetadata(
    allChapterFilesArray: string[],
    allSummaryFilesArray: string[],
    outputFile: string
  ) {
    cli.action.start('Extracting markup and updating metadata'.actionStartColor())
    // debug(`starting extractGlobalMetadata`)

    const flattenedChapterMarkupArray = await this.extractMarkupFromFiles(allChapterFilesArray)
    const flattenedSummaryMarkupArray = await this.extractMarkupFromFiles(allSummaryFilesArray)
    const flattenedMarkupArray = await this.combineChapterAndSummaryMetadata(flattenedChapterMarkupArray, flattenedSummaryMarkupArray)
    await this.updateGlobalAndChapterMetadata(flattenedMarkupArray, outputFile)
    /*
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
*/
    cli.action.stop(`done`.actionStopColor())
    // table.show()
  }
  public async extractMarkupFromFiles(allFilesArray: string[]): Promise<MarkupObj[]> {
    const extractPromises: Promise<MarkupObj[]>[] = []
    allFilesArray.forEach(cf => {
      extractPromises.push(this.extractMarkupFromFile(cf))
    })

    return Promise.all(extractPromises).then(fullMarkupArray => {
      const flattenedMarkupArray: MarkupObj[] = ([] as MarkupObj[]).concat(...fullMarkupArray)

      return flattenedMarkupArray
    })
  }
  public async updateGlobalAndChapterMetadata(flattenedMarkupArray: MarkupObj[], outputFile: string) {
    const table = tableize('file', 'diff')
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
      modifiedMetadataFiles.map(val => ({ from: this.softConfig.mapFileToBeRelativeToRootPath(val.file), to: 'updated' })) //to: val.diff
    )

    table.show()
  }

  public combineChapterAndSummaryMetadata(flattenedChapterMarkupArray: MarkupObj[], flattenedSummaryMarkupArray: MarkupObj[]): MarkupObj[] {
    return flattenedChapterMarkupArray.concat(
      flattenedSummaryMarkupArray.map(s => {
        const summaryNum = this.softConfig.extractNumber(s.filename)
        const summaryAtNumbering = this.softConfig.isAtNumbering(s.filename)

        const chapterFilename = flattenedChapterMarkupArray.filter(c => {
          const chapterNum = this.softConfig.extractNumber(c.filename)
          const chapterAtNumbering = this.softConfig.isAtNumbering(c.filename)

          return chapterNum === summaryNum && chapterAtNumbering === summaryAtNumbering
        })[0].filename
        s.filename = chapterFilename
        s.summary = true
        return s
      })
    )
  }

  public async UpdateSingleMetadata(chapterFile: string) {
    cli.action.start(`Extracting markup from ${chapterFile}`.actionStartColor())

    const markupObjArr = await this.extractMarkupFromFile(chapterFile)
    const markupByFile = this.getMarkupByFile(markupObjArr)
    const modifiedMetadataFiles = await this.writeMetadataInEachFile(markupByFile)
    const modifiedFile = modifiedMetadataFiles[0]

    const msg = modifiedFile ? `updated ${modifiedFile.file} with ${modifiedFile.diff}`.actionStopColor() : 'updated nothing'
    cli.action.stop(msg)
  }

  public async extractWordCountHistory2(recalculateWritingRate: boolean): Promise<WordCountObject[]> {
    const wordCountData = this.softConfig.WordCountData
    const dateSortAscFunction = (a: { date: moment.Moment }, b: { date: moment.Moment }) => {
      return a.date.valueOf() < b.date.valueOf() ? -1 : a.date.valueOf() > b.date.valueOf() ? 1 : 0
    }

    const today = moment(moment().toDate())
    const daysFromToday =
      recalculateWritingRate || wordCountData.length < 3
        ? 0
        : today.diff(wordCountData.sort((a, b) => -dateSortAscFunction(a, b))[2].date.toDate(), 'days')
    debug(`day diffed from today=${wordCountData.sort((a, b) => -dateSortAscFunction(a, b))[2].date.toDate()}`)
    debug(`daysFromToday=${daysFromToday}`)
    const allDatedContentFiles = (await this.gitUtils.GetGitListOfHistoryFiles(daysFromToday)).sort(dateSortAscFunction)

    // const value: WordCountObject[] = []
    let tempChapterTotal = 0
    let tempSummaryTotal = 0

    //TODO: refactor with .map.reduce?
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
        wordCountChapterTotal: wcChapterTotalForDay,
        wordCountChapterDiff: wcChapterTotalForDay - tempChapterTotal,
        wordCountSummaryTotal: wcSummaryTotalForDay,
        wordCountSummaryDiff: wcSummaryTotalForDay - tempSummaryTotal
      }
      debug(`indexOfDate=${indexOfDate}`)
      debug(`wordCountData[indexOfDate]=${JSON.stringify(wordCountData[indexOfDate])}`)
      debug(`wordCountForDate=${JSON.stringify(wordCountForDate)}`)
      if (indexOfDate === -1) {
        wordCountData.push(wordCountForDate)
      } else {
        if (tempChapterTotal > 0 || tempSummaryTotal > 0) {
          wordCountData[indexOfDate] = wordCountForDate
        }
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

  public async extractMarkupFromFile(filepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []

    // debug(`in ExtractMarkup; filePath=${filepath}`)

    // try {
    const isAtNumbering = this.softConfig.isAtNumbering(filepath)
    const summary = this.softConfig.summaryRegex(isAtNumbering).test(filepath)
    const initialContent = await this.fsUtils.readFileContent(path.join(this.rootPath, filepath))
    const markupRegex = /(?:{{(\d+)}}\n)|{([^}]*?)\s?:\s?(.*?)}/gm
    const propRegex = /(?:{{(\d+)}}\n)|{([^:,.!\n{}]+?)}/gm

    let regexArray: RegExpExecArray | null
    let paraCounter = 1
    while ((regexArray = markupRegex.exec(initialContent)) !== null) {
      if (regexArray[1]) {
        paraCounter = parseInt(regexArray[1], 10)
      } else {
        resultArray.push({
          filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
          paragraph: paraCounter,
          type: regexArray[2].toLowerCase(),
          value: regexArray[3],
          computed: false,
          summary
        })
      }
    }
    paraCounter = 1
    while ((regexArray = propRegex.exec(initialContent)) !== null) {
      if (regexArray[1]) {
        paraCounter = parseInt(regexArray[1], 10)
      } else {
        const propValue = this.softConfig.getFinalPropFor(regexArray[2])
        resultArray.push({
          filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
          paragraph: paraCounter,
          type: 'prop',
          value: propValue,
          computed: false,
          summary
        })
      }
    }
    const wordCount = this.GetWordCount(initialContent)
    resultArray.push({
      filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
      type: summary ? 'summaryWordCount' : 'wordCount',
      value: wordCount,
      computed: true,
      summary
    })
    const title = (await this.extractTitleFromString(initialContent)) || '###'
    resultArray.push({
      filename: this.softConfig.mapFileToBeRelativeToRootPath(filepath),
      type: 'title',
      value: title,
      computed: true,
      summary
    })
    // } catch (err) {
    //   throw new ChptrError(err.toString().errorColor())
    // }

    // debug(`end of extractMarkup.  result=${JSON.stringify(resultArray)}`)
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
    return flattenedMarkupArray.reduce((cumul, markup) => {
      cumul[markup.filename] = cumul[markup.filename] || []
      if (markup.summary) {
        let rec = { summary: true, computed: false, type: markup.type, value: markup.value }
        if (
          !cumul[markup.filename].find(value => {
            return value.summary == rec.summary && rec.type == markup.type && value.value == markup.value
          })
        ) {
          cumul[markup.filename].push(rec)
        }
      } else if (markup.computed) {
        cumul[markup.filename].push({ summary: false, computed: true, type: markup.type, value: markup.value })
      } else {
        let existingValue = cumul[markup.filename].find(value => {
          return value.summary == false && value.computed == false && value.type == markup.type && value.value == markup.value
        })
        if (existingValue && markup.paragraph) {
          let existing = existingValue.paragraph
            ? Array.isArray(existingValue.paragraph)
              ? existingValue.paragraph
              : [existingValue.paragraph]
            : []
          if (existing.indexOf(markup.paragraph) < 0) {
            existingValue.paragraph = existing.concat([markup.paragraph])
          }
        } else {
          cumul[markup.filename].push({
            summary: false,
            computed: false,
            paragraph: markup.paragraph,
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
      if (!markup.computed) {
        cumul[markup.type] = cumul[markup.type] || {}
        cumul[markup.type][markup.value] = cumul[markup.type][markup.value] || []
        let existingValue = cumul[markup.type][markup.value].find(
          (value: { summary: boolean; filename: string; paragraph: number | number[] }) => {
            return value.summary == markup.summary && value.filename == markup.filename
          }
        )
        if (existingValue) {
          let existing = existingValue.paragraph
            ? Array.isArray(existingValue.paragraph)
              ? existingValue.paragraph
              : [existingValue.paragraph]
            : []
          if (existing.indexOf(markup.paragraph) < 0) {
            existingValue.paragraph = existing.concat([markup.paragraph])
          }
        } else {
          cumul[markup.type][markup.value].push({ filename: markup.filename, paragraph: markup.paragraph, summary: markup.summary })
        }
      } else {
        if (markup.type === 'wordCount') {
          cumul.totalWordCount = cumul.totalWordCount || 0
          cumul.totalWordCount += markup.value
        }
      }
      return cumul
    }, {} as any)
  }

  public async writeMetadataInEachFile(markupByFile: any): Promise<{ file: string; diff: string }[]> {
    const modifiedFiles: { file: string; diff: string }[] = []

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

      const initialObj = this.softConfig.parsePerStyle(initialContent)
      let updatedObj = JSON.parse(JSON.stringify(initialObj)) //used to create deep copy

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
              `element: ${JSON.stringify(element)}\nlength: ${
                element.length
              }\nTrue or False: ${!!element}\nhasEmptyObject: ${hasEmptyObject}`
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

    // var mkString = new MarkupString(initialContent)

    const replacedContent = initialContent //mkString
      .replace(/—/gm, '--')
      .replace(paragraphBreakRegex, '')
      .replace(/ {[^}]+?:.+?}([,;:.!?…*"])/gm, '$1')
      .replace(/ ?{[^}]+?:.+?} ?/gm, ' ')
      .replace(sentenceBreakRegex, '  ')
      .replace(/^### (.*)$/gm, '* * *')
      .replace(/^\\(.*)$/gm, '_% $1_')
      .replace(this.propRegex, '$1')

    return replacedContent
  }

  public transformMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{(\\d+)}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')
    let markupCounter = 0

    const transformInFootnote = function (initial: string): { replaced: string; didReplacement: boolean } {
      let didReplacement = false
      const replaced = initial.replace(/(?<!{){([^}:]+?)\s?:\s?(.+?)} ?(.*)$/m, (_full, one, two, three) => {
        markupCounter++
        didReplacement = didReplacement || (one && two)
        let after = three.length > 0 ? ` ${three}` : ''
        return `^_${one}:_^[^z${markupCounter}]${after}\n\n[^z${markupCounter}]: **${one.toUpperCase()}**: ${two}\n\n`
      })
      return { replaced, didReplacement }
    }

    let replacedContent = initialContent
      .replace(/—/gm, '--')
      .replace(paragraphBreakRegex, '^_($1)_^\t')
      .replace(/^### (.*)$/gm, '* * *\n\n## $1')
      .replace(/^\\(.*)$/gm, '_% $1_')
      .replace(this.propRegex, '**$1**')
      // .replace(this.propRegex, '$2**$3**')
      .replace(sentenceBreakRegex, '  ')

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
      // debug(`file=${file}`)
      const initialContent = await this.fsUtils.readFileContent(file)
      try {
        const initialObj = this.softConfig.parsePerStyle(initialContent)

        const { replacedObj, changeApplied } = this.GetUpdatedMetadataFieldsFromDefaults(
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

  public GetUpdatedMetadataFieldsFromDefaults(
    initialObj: any,
    filename?: string,
    table?: ITable
  ): { replacedObj: any; changeApplied: boolean } {
    const replacedObj = JSON.parse(JSON.stringify(initialObj)) //used to create deep copy

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
    return { replacedObj, changeApplied }
  }

  private async contentHasChangedVersusFile(filepath: string, content: string) {
    const existingFileContent = await this.fsUtils.readFileContent(filepath)
    return existingFileContent !== content
  }
}

export interface WordCountHistoryObj {
  log: {
    file: string
    hash: string
    date: moment.Moment
    subject: string
  }
  wordCountDiff: number
}

export interface MarkupObj {
  filename: string
  paragraph?: number
  type: string
  value: string | number
  computed: boolean
  summary: boolean
}

interface MarkupByFile {
  [filename: string]: [
    {
      paragraph?: number | number[]
      type: string
      value: string | number
      computed?: boolean
      summary?: boolean
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
