import { Inject, InjectValue } from 'typescript-ioc'
import { CoreUtils } from './core-utils'
import { MarkupUtils } from './markup-utils'
import { FsUtils } from './fs-utils'
import { glob } from 'glob'
import path = require('path')
import { SoftConfig, WordCountObject } from './soft-config'
import { ux } from '@oclif/core'
import { tableize } from './ui-utils'
import { ChptrError } from './chptr-error'
import * as moment from 'moment'

const debug = require('debug')('build:metadata-executor')

export default class MetadataExecutor {
  private readonly coreUtils: CoreUtils
  private readonly markupUtils: MarkupUtils
  private readonly fsUtils: FsUtils
  private readonly softConfig: SoftConfig
  private readonly rootPath: string

  constructor(
    @Inject coreUtils: CoreUtils,
    @Inject markupUtils: MarkupUtils,
    @Inject fsUtils: FsUtils,
    @Inject softConfig: SoftConfig,
    @InjectValue('rootPath') rootPath: string
  ) {
    this.coreUtils = coreUtils
    this.markupUtils = markupUtils
    this.fsUtils = fsUtils
    this.softConfig = softConfig
    this.rootPath = rootPath
  }

  public GetOutputFile(flags: any): string {
    return `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${this.fsUtils.sanitizeFileName(
      this.softConfig.config.projectTitle
    )}`
  }

  public async RunMetadata(flags: any): Promise<void> {
    try {
      const wrOption = flags.showWritingRate
      const showWritingRate = wrOption === 'yes' || wrOption === 'overwrite'
      const recalculateWritingRate = wrOption === 'overwrite'
      // const showWritingRateDetails = wrOption === 'all' || wrOption === 'export'
      // const exportWritingRate = wrOption === 'export'

      // todo: should this be done even if -save flag not on?
      if (flags.save) {
        await this.coreUtils.preProcessAndCommitFiles('Autosave before build')
      }

      await this.markupUtils.UpdateAllMetadataFieldsFromDefaults()

      await this.fsUtils.createSubDirectoryFromDirectoryPathIfNecessary(this.softConfig.buildDirectory)

      const allChapterFilesArray = (await glob(path.join(this.rootPath, this.softConfig.chapterWildcard(false)))).concat(
        await glob(path.join(this.rootPath, this.softConfig.chapterWildcard(true)))
      )

      const allSummaryFilesArray = (await glob(path.join(this.rootPath, this.softConfig.summaryWildcard(false)))).concat(
        await glob(path.join(this.rootPath, this.softConfig.summaryWildcard(true)))
      )

      await this.markupUtils.extractMarkupAndUpdateGlobalAndChapterMetadata(
        allChapterFilesArray,
        allSummaryFilesArray,
        this.GetOutputFile(flags)
      )
      await this.coreUtils.rewriteLabelsInFilesWithNumbersInContent(true) // todo: get value for A-for-at-numbering
      await this.coreUtils.createCharacterTimelines()
      await this.coreUtils.setNumbersInChosenItemsOfMetadata()
      await this.coreUtils.formatDefinitionFiles()
      if (flags.save) {
        await this.coreUtils.preProcessAndCommitFiles('Autosave markup updates')
      }

      if (showWritingRate) {
        ux.action.start('Extracting word count stats for all content files'.actionStartColor())
        debug('before getting wordCountHistory')
        const wordCountHistory = await this.markupUtils.extractWordCountHistory2(recalculateWritingRate)
        debug('after getting wordCountHistory')
        const numDigits = (val: number) => {
          const digits = Math.max(Math.floor(Math.log10(Math.abs(val))), 0) + 1
          return Math.abs(val) === val ? digits : digits + 1
        }

        const stringifyNumber = (val: number, numDigits: number): string => {
          const s = val.toString()
          const spaces = Math.max(numDigits - s.length, 0)
          if (spaces > 0) {
            return ' '.repeat(spaces).concat(s)
          }

          return s
        }

        const digitsCount = (wch: WordCountObject[], property: string): number =>
          wch.map((val: WordCountObject) => numDigits(val[property] as number)).reduce((pv, cv) => Math.max(pv, cv), 0)

        if (wordCountHistory.length > 0) {
          const digits: { [index: string]: number } = {}
          for (const prop of ['wordCountChapterDiff', 'wordCountSummaryDiff', 'wordCountChapterTotal', 'wordCountSummaryTotal']) {
            digits[prop] = digitsCount(wordCountHistory, prop)
          }

          debug(`digits=${JSON.stringify(digits)}`)

          const tableSummary = tableize('Date', 'Word count diff chapters | summaries (total chapters | summaries)')
          for (const wcHistory of wordCountHistory) {
            debug(`wcHistory: ${JSON.stringify(wcHistory)}`)
            debug(`typeof wcHistory.date: ${typeof wcHistory.date}`)
            const result = `${stringifyNumber(wcHistory.wordCountChapterDiff, digits.wordCountChapterDiff)} | ${stringifyNumber(
              wcHistory.wordCountSummaryDiff,
              digits.wordCountSummaryDiff
            )} (total ${stringifyNumber(wcHistory.wordCountChapterTotal, digits.wordCountChapterTotal)} | ${stringifyNumber(
              wcHistory.wordCountSummaryTotal,
              digits.wordCountSummaryTotal
            )})`
            tableSummary.accumulator(wcHistory.date.format('YYYY-MM-DD (ddd)'), result)
          }

          tableSummary.show()
        } else {
          ux.warn('No history in repository')
        }

        ux.action.stop('done'.actionStopColor())
      }
    } catch (error: any) {
      throw new ChptrError(error, 'build:RunMetadata', 3)
    }
  }
}
