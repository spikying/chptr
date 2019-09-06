import { flags } from '@oclif/command'
import { exec } from 'child_process'
import cli from 'cli-ux'
import * as moment from 'moment'
import * as path from 'path'
import { file as tmpFile } from 'tmp-promise'

import { ChptrError } from '../../chptr-error'
import { MetaObj } from '../../markup-utils'
import { QueryBuilder, tableize } from '../../ui-utils'
import { d } from '../base'
import Command from './metadata'

const debug = d('build')

//TODO: make use of all other parts of build directory's Run commands so code is not duplicated
export default class Build extends Command {
  static readonly exportableFileTypes = ['md', 'pdf', 'docx', 'html', 'epub', 'tex']

  static description = `Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: ${Build.exportableFileTypes.join(
    ', '
  )}.  Gives some insight into writing rate.`

  static flags = {
    ...Command.flags,
    filetype: flags.string({
      char: 't',
      description: 'filetype to export to.  Can be set multiple times.',
      options: Build.exportableFileTypes.concat('all'),
      default: '',
      multiple: true
    }),
    // datetimestamp: flags.boolean({
    //   char: 'd',
    //   description: 'adds datetime stamp before output filename',
    //   default: false
    // }),
    removemarkup: flags.boolean({
      char: 'r',
      description: 'Remove paragraph numbers and other markup in output',
      default: false
    })
    // ,
    // showWritingRate: flags.string({
    //   char: 's',
    //   description: 'Show word count per day in varying details',
    //   options: ['all', 'short', 'none', 'export'],
    //   default: 'short'
    // })
  }

  static aliases = ['compile']
  static hidden = false

  async run() {
    debug('Running Build command')

    const tmpMDfile = await tmpFile()
    const tmpMDfileTex = await tmpFile()
    debug(`temp files = ${tmpMDfile.path} and ${tmpMDfileTex.path}`)

    try {
      const { flags } = this.parse(Build)

      await this.RunMetadata(flags)

      const removeMarkup = flags.removemarkup

      // const wrOption = flags.showWritingRate
      // const showWritingRate = wrOption === 'all' || wrOption === 'short' || wrOption === 'export'
      // const showWritingRateDetails = wrOption === 'all' || wrOption === 'export'
      // const exportWritingRate = wrOption === 'export'

      // const outputFile = `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${this.fsUtils.sanitizeFileName(
      //   this.softConfig.config.projectTitle
      // )}`

      let outputFiletype = flags.filetype
      if (!outputFiletype) {
        const queryBuilder = new QueryBuilder()
        queryBuilder.add('type', queryBuilder.checkboxinput(Build.exportableFileTypes, 'Which filetype(s) to output?', ['md']))
        const queryResponses: any = await queryBuilder.responses()
      outputFiletype = queryResponses.type
      }
      if (outputFiletype.indexOf('all') >= 0) {
        outputFiletype = Build.exportableFileTypes
      }

      // await this.coreUtils.preProcessAndCommitFiles('Autosave before build')

      // await this.markupUtils.UpdateAllMetadataFieldsFromDefaults()

      // await this.fsUtils.createSubDirectoryFromDirectoryPathIfNecessary(this.softConfig.buildDirectory)

      const originalChapterFilesArray = (await this.fsUtils.listFiles(
        path.join(this.rootPath, this.softConfig.chapterWildcard(false))
      )).sort()

      // const allChapterFilesArray = originalChapterFilesArray.concat(
      //   await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcard(true)))
      // )

      // await this.markupUtils.extractAndUpdateGlobalAndChapterMetadata(allChapterFilesArray, outputFile)
      // await this.coreUtils.preProcessAndCommitFiles('Autosave markup updates')

      // cli.info('Extracting metadata for all chapters files'.actionStartColor())

      // const allMetadataFilesArray = (await this.fsUtils.listFiles(
      //   path.join(this.rootPath, this.softConfig.metadataWildcard(false))
      // )).concat(await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.metadataWildcard(true))))

      // const metaExtractPromises: Promise<MetaObj[]>[] = []
      // allMetadataFilesArray.forEach(m => {
      //   metaExtractPromises.push(this.markupUtils.extractMeta(m, exportWritingRate))
      // })
      // await Promise.all(metaExtractPromises).then(async fullMetaArray => {
      //   //flatten equivalent
      //   const flattenedMetaArray: MetaObj[] = ([] as MetaObj[]).concat(...fullMetaArray).filter(m => m.wordCountDiff !== 0)

      //   const diffByDate: any = {}

      //   const mappedDiffArray = flattenedMetaArray.map(m => ({
      //     file: m.log.file,
      //     date: m.log.date.format('YYYY-MM-DD'),
      //     diff: m.wordCountDiff
      //   }))

      //   debug(`mappedArray=${JSON.stringify(mappedDiffArray.filter(d => d.date === moment().format('YYYY-MM-DD')), null, 2)}`)

      //   if (exportWritingRate) {
      //     cli.action.start('Writing rate CSV file'.actionStartColor())
      //     let csvContent = 'Date;Chapter Number;Word Count Diff\n'

      //     mappedDiffArray.forEach((m: { date: any; file: any; diff: any }) => {
      //       const isAtNumbering = this.softConfig.isAtNumbering(m.file)
      //       const chapterNumberMatch = this.softConfig.metadataRegex(isAtNumbering).exec(m.file)
      //       const chapterNumber = chapterNumberMatch ? (isAtNumbering ? '@' : '') + chapterNumberMatch[1] : '?'
      //       csvContent += `${m.date};${chapterNumber};${m.diff}\n`
      //     })
      //     const writingRateFilePath = path.join(this.softConfig.buildDirectory, 'writingRate.csv')
      //     await this.fsUtils.writeFile(writingRateFilePath, csvContent)
      //     cli.action.stop(`Created ${writingRateFilePath}`.actionStopColor())
      //   }

      //   mappedDiffArray.forEach((m: { date: any; file: any; diff: any }) => {
      //     if (!diffByDate[m.date]) {
      //       diffByDate[m.date] = { total: 0 }
      //     }
      //     if (!diffByDate[m.date][m.file]) {
      //       diffByDate[m.date][m.file] = m.diff
      //     } else {
      //       diffByDate[m.date][m.file] += m.diff
      //     }
      //     diffByDate[m.date].total += m.diff
      //   })

      //   if (showWritingRate) {
      //     cli.info(`Writing rate:`.infoColor())
      //     const tableSummary = tableize('Date', 'Word diff')
      //     const tableDetails = tableize('Date | Chapter file #', 'Word diff')
      //     for (const date of Object.keys(diffByDate).sort()) {
      //       tableSummary.accumulator(date, diffByDate[date].total.toString())

      //       if (showWritingRateDetails) {
      //         for (const metafile of Object.keys(diffByDate[date])) {
      //           if (metafile !== 'total') {
      //             const isAtNumbering = this.softConfig.isAtNumbering(metafile)
      //             const chapterNumberMatch = this.softConfig.metadataRegex(isAtNumbering).exec(metafile)
      //             const chapterNumber = chapterNumberMatch ? (isAtNumbering ? '@' : '') + chapterNumberMatch[1] : '?'

      //             let wordDiff: string = diffByDate[date][metafile].toString()
      //             wordDiff = wordDiff.resultSecondaryColor()

      //             tableDetails.accumulator(`${date.infoColor()} # ${chapterNumber}`, wordDiff)
      //           }
      //         }
      //       }
      //     }
      //     tableDetails.show()
      //     tableSummary.show()
      //   }
      // })

      cli.action.start('Compiling and generating output files'.actionStartColor())

      let fullOriginalContent = this.softConfig.globalMetadataContent
      for (const file of originalChapterFilesArray) {
        fullOriginalContent += '\n' + (await this.fsUtils.readFileContent(file))
      }
      const fullCleanedOrTransformedContent = removeMarkup
        ? this.markupUtils.cleanMarkupContent(fullOriginalContent)
        : this.markupUtils.transformMarkupContent(fullOriginalContent)
      await this.fsUtils.writeInFile(tmpMDfile.fd, fullCleanedOrTransformedContent)
      await this.fsUtils.writeInFile(tmpMDfileTex.fd, fullCleanedOrTransformedContent.replace(/^\*\s?\*\s?\*$/gm, '\\asterism'))

      let chapterFiles = '"' + tmpMDfile.path + '" '

      const pandocRuns: Promise<void>[] = []
      const allOutputFilePath: string[] = []

      for (const filetype of outputFiletype) {
        // outputFiletype.forEach(filetype => {
        const fullOutputFilePath = path.join(this.softConfig.buildDirectory, this.outputFile + '.' + filetype)
        allOutputFilePath.push(fullOutputFilePath)

        let pandocArgs: string[] = []

        if (filetype === 'md') {
          pandocArgs = pandocArgs.concat(['--number-sections', '--to', 'markdown-raw_html+smart', '--wrap=none', '--atx-headers'])
        }

        if (filetype === 'docx') {
          const referenceDocFullPath = path.join(this.hardConfig.configPath, 'reference.docx')
          if (await this.fsUtils.fileExists(referenceDocFullPath)) {
            pandocArgs = pandocArgs.concat([`--reference-doc="${referenceDocFullPath}"`])
          } else {
            this.warn(`For a better output, create an empty styled Word doc at ${referenceDocFullPath}`)
          }
          pandocArgs = pandocArgs.concat([
            '--to',
            'docx+smart',
            '--toc',
            '--toc-depth',
            '2',
            '--top-level-division=chapter',
            '--number-sections'
          ])
        }

        if (filetype === 'html') {
          const templateFullPath = path.join(this.hardConfig.configPath, 'template.html')
          if (await this.fsUtils.fileExists(templateFullPath)) {
            pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
          } else {
            this.warn(`For a better output, create an html template at ${templateFullPath}`)
          }

          const cssFullPath = path.join(this.hardConfig.configPath, 'template.css')
          if (await this.fsUtils.fileExists(cssFullPath)) {
            pandocArgs = pandocArgs.concat([`--css`, `"${cssFullPath}"`])
          } else {
            this.warn(`For a better output, create a css template at ${cssFullPath}`)
          }

          pandocArgs = pandocArgs.concat([
            '--to',
            'html5+smart',
            '--toc',
            '--toc-depth',
            '2',
            '--top-level-division=chapter',
            '--number-sections',
            '--self-contained'
          ])
        }

        if (filetype === 'pdf' || filetype === 'tex') {
          chapterFiles = '"' + tmpMDfileTex.path + '" '

          const templateFullPath = path.join(this.hardConfig.configPath, 'template.latex')
          if (await this.fsUtils.fileExists(templateFullPath)) {
            pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
          } else {
            this.warn(`For a better output, create a latex template at ${templateFullPath}`)
          }

          pandocArgs = pandocArgs.concat([
            '--toc',
            '--toc-depth',
            '2',
            '--top-level-division=chapter',
            '--number-sections',
            // '--latex-engine=xelatex',
            '--pdf-engine=xelatex',
            '--to',
            'latex+raw_tex+smart'
          ])
        }

        if (filetype === 'epub') {
          pandocArgs = pandocArgs.concat([
            '--to',
            'epub+smart',
            '--toc',
            '--toc-depth',
            '2',
            '--top-level-division=chapter',
            '--number-sections'
          ])
        }

        pandocArgs = [
          chapterFiles,
          // '--smart',
          '--standalone',
          '-o',
          `"${fullOutputFilePath}"`
        ].concat(pandocArgs)

        pandocRuns.push(this.runPandoc(pandocArgs))
      }

      await Promise.all(pandocRuns).catch(err => {
        throw new ChptrError(
          `Error trying to run Pandoc.  You need to have it installed and accessible globally, with version 2.7.3 minimally.\n${err
            .toString()
            .errorColor()}`,
          'command:build:index',
          52
        )
      })

      const allOutputFilePathPretty = allOutputFilePath.reduce((previous, current) => `${previous}\n    ${current}`, '')
      cli.action.stop(allOutputFilePathPretty.actionStopColor())

      // if (compact) {
      //   await this.coreUtils.compactFileNumbers()
      //   await this.coreUtils.preProcessAndCommitFiles('Compacted file numbers')
      // }
    } catch (err) {
      throw new ChptrError(err, 'build.run', 3)
    } finally {
      await tmpMDfile.cleanup()
      await tmpMDfileTex.cleanup()
    }
  }

  private async runPandoc(options: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = 'pandoc ' + options.join(' ')
      debug(`Executing child process with command ${command}`)
      exec(command, (err, pout, perr) => {
        if (err) {
          this.error(err.toString().errorColor())
          reject(err)
        }
        if (perr) {
          this.error(perr.toString().errorColor())
          reject(perr)
        }
        if (pout) {
          this.log(pout)
        }
        resolve()
      })
    })
  }
}
