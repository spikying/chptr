import { flags } from '@oclif/command'
import { Input } from '@oclif/parser'
import cli from 'cli-ux'
import * as moment from 'moment'
import * as path from 'path'

import { ChptrError } from '../../chptr-error'
import { WordCountHistoryObj } from '../../markup-utils'
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
      description: 'Show word count per day in varying details',
      options: ['all', 'short', 'none', 'export'],
      default: 'short'
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
      const showWritingRate = wrOption === 'all' || wrOption === 'short' || wrOption === 'export'
      const showWritingRateDetails = wrOption === 'all' || wrOption === 'export'
      const exportWritingRate = wrOption === 'export'

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
      await this.markupUtils.extractAndUpdateGlobalAndChapterMetadata(allChapterFilesArray, allSummaryFilesArray, this.outputFile)
      await this.coreUtils.preProcessAndCommitFiles('Autosave markup updates')

      cli.info('Extracting metadata for all chapters files'.actionStartColor())

      const allMetadataFilesArray = (await this.fsUtils.listFiles(
        path.join(this.rootPath, this.softConfig.metadataWildcard(false))
      )).concat(await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.metadataWildcard(true))))

      const wordCountExtractPromises: Promise<WordCountHistoryObj[]>[] = []
      allMetadataFilesArray.forEach(m => {
        wordCountExtractPromises.push(this.markupUtils.extractWordCountHistory(m, exportWritingRate))
      })
      await Promise.all(wordCountExtractPromises).then(async fullMetaArray => {
        //flatten equivalent
        const flattenedWordCountArray: WordCountHistoryObj[] = ([] as WordCountHistoryObj[]).concat(...fullMetaArray).filter(m => m.wordCountDiff !== 0)

        const diffByDate: any = {}

        const mappedDiffArray = flattenedWordCountArray.map(m => ({
          file: m.log.file,
          date: m.log.date.format('YYYY-MM-DD'),
          diff: m.wordCountDiff
        }))

        debug(`mappedArray=${JSON.stringify(mappedDiffArray.filter(d => d.date === moment().format('YYYY-MM-DD')), null, 2)}`)

        if (exportWritingRate) {
          cli.action.start('Writing rate CSV file'.actionStartColor())
          let csvContent = 'Date;Chapter Number;Word Count Diff\n'

          mappedDiffArray.forEach((m: { date: any; file: any; diff: any }) => {
            const isAtNumbering = this.softConfig.isAtNumbering(m.file)
            const chapterNumberMatch = this.softConfig.metadataRegex(isAtNumbering).exec(m.file)
            const chapterNumber = chapterNumberMatch ? (isAtNumbering ? '@' : '') + chapterNumberMatch[1] : '?'
            csvContent += `${m.date};${chapterNumber};${m.diff}\n`
          })
          const writingRateFilePath = path.join(this.softConfig.buildDirectory, 'writingRate.csv')
          await this.fsUtils.writeFile(writingRateFilePath, csvContent)
          cli.action.stop(`Created ${writingRateFilePath}`.actionStopColor())
        }

        //todo: change to Reduce function
        mappedDiffArray.forEach((m: { date: any; file: any; diff: any }) => {
          if (!diffByDate[m.date]) {
            diffByDate[m.date] = { total: 0 }
          }
          if (!diffByDate[m.date][m.file]) {
            diffByDate[m.date][m.file] = m.diff
          } else {
            diffByDate[m.date][m.file] += m.diff
          }
          diffByDate[m.date].total += m.diff
        })

        if (showWritingRate) {
          cli.info(`Writing rate:`.infoColor())
          const tableSummary = tableize('Date', 'Word diff')
          const tableDetails = tableize('Date | Chapter file #', 'Word diff')
          for (const date of Object.keys(diffByDate).sort()) {
            tableSummary.accumulator(date, diffByDate[date].total.toString())

            if (showWritingRateDetails) {
              for (const metafile of Object.keys(diffByDate[date])) {
                if (metafile !== 'total') {
                  const isAtNumbering = this.softConfig.isAtNumbering(metafile)
                  const chapterNumberMatch = this.softConfig.metadataRegex(isAtNumbering).exec(metafile)
                  const chapterNumber = chapterNumberMatch ? (isAtNumbering ? '@' : '') + chapterNumberMatch[1] : '?'

                  let wordDiff: string = diffByDate[date][metafile].toString()
                  wordDiff = wordDiff.resultSecondaryColor()

                  tableDetails.accumulator(`${date.infoColor()} # ${chapterNumber}`, wordDiff)
                }
              }
            }
          }
          tableDetails.show()
          tableSummary.show()
        }
      })
    } catch (err) {
      throw new ChptrError(err, 'build:RunMetadata', 3)
    }
  }
}
