import { flags } from '@oclif/command'
import { Input } from '@oclif/parser'
import cli from 'cli-ux'
import * as moment from 'moment'
import * as path from 'path'

import { ChptrError } from '../../chptr-error'
import { WordCountHistoryObj } from '../../markup-utils'
import { WordCountObject } from '../../soft-config'
import { tableize } from '../../ui-utils'
import { d } from '../base'
import Command from '../compactable-base'

const debug = d('build:metadata')

export default class Metadata extends Command {
  static description = `Updates only metadata files`

  static flags = {
    ...Command.flags,
    datetimestamp: flags.boolean({
      char: 'd',
      description: 'adds datetime stamp before output filename',
      default: false
    }),
    showWritingRate: flags.string({
      char: 's',
      description: 'Show word count per day.  Overwrite option recalculates it all from scratch.',
      options: ['yes', 'no', 'overwrite'],
      default: 'yes'
    })
  }

  static hidden = false

  private _outputFile = ''
  public get outputFile(): string {
    return this._outputFile
  }

  async init() {
    debug('init of  Build:metadata')
    await super.init()

    const { flags } = this.parse(this.constructor as Input<any>)
    this._outputFile = `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${this.fsUtils.sanitizeFileName(
      this.softConfig.config.projectTitle
    )}`
  }

  async run() {
    debug('Running Build:metadata command')
    const { flags } = this.parse(this.constructor as Input<any>)

    await this.RunMetadata(flags)
  }

  public async RunMetadata(flags: any) {
    try {
      const wrOption = flags.showWritingRate
      const showWritingRate = wrOption === 'yes' || wrOption === 'overwrite'
      const recalculateWritingRate = wrOption === 'overwrite'
      // const showWritingRateDetails = wrOption === 'all' || wrOption === 'export'
      // const exportWritingRate = wrOption === 'export'

      await this.coreUtils.preProcessAndCommitFiles('Autosave before build')

      await this.markupUtils.UpdateAllMetadataFieldsFromDefaults()

      await this.fsUtils.createSubDirectoryFromDirectoryPathIfNecessary(this.softConfig.buildDirectory)

      // const originalChapterFilesArray = (await this.fsUtils.listFiles(
      //   path.join(this.rootPath, this.softConfig.chapterWildcard(false))
      // )).sort()

      const allChapterFilesArray = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcard(false)))).concat(
        await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcard(true)))
      )

      const allSummaryFilesArray = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.summaryWildcard(false)))).concat(
        await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.summaryWildcard(true)))
      )

      // const summaryWordCountMetadata = (await this.markupUtils.extractGlobalAndChapterMetadata(allSummaryFilesArray)).filter(
      //   m => m.type !== 'title'
      // )
      // debug(`flatSummaryMetadata: ${JSON.stringify(summaryWordCountMetadata, null, 4)}`)
      await this.markupUtils.extractMarkupAndUpdateGlobalAndChapterMetadata(allChapterFilesArray, allSummaryFilesArray, this.outputFile)
      await this.coreUtils.preProcessAndCommitFiles('Autosave markup updates')

      if (showWritingRate) {
        cli.action.start('Extracting word count stats for all content files'.actionStartColor())

        const wordCountHistory = await this.markupUtils.extractWordCountHistory2(recalculateWritingRate)
        const numDigits = (val: number) => {
          const digits = Math.max(Math.floor(Math.log10(Math.abs(val))), 0) + 1
          return Math.abs(val) === val ? digits : digits + 1
        }
        const stringifyNumber = (val: number, numDigits: number): string => {
          const s = val.toString()
          const spaces = Math.max(numDigits - s.length, 0)
          if (spaces > 0) {
            return ' '.repeat(spaces).concat(s)
          } else {
            return s
          }
        }
        const digitsCount = (wch: WordCountObject[], property: string): number => {
          return wch
            .map((val: WordCountObject) => numDigits(val[property] as number))
            .reduce((pv, cv) => {
              return Math.max(pv, cv)
            }, 0)
        }

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
          cli.warn('No history in repository')
        }
        cli.action.stop('done'.actionStopColor())
      }
    } catch (err) {
      throw new ChptrError(err, 'build:RunMetadata', 3)
    }
  }
}
