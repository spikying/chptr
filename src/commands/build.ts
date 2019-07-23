import { flags } from '@oclif/command'
import { exec } from 'child_process'
import cli from 'cli-ux'
import yaml = require('js-yaml')
import * as moment from 'moment'
import * as path from 'path'
import { file as tmpFile } from 'tmp-promise'

import { MarkupObj } from '../markup-utils'
import { QueryBuilder, tableize } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('command:build')

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
    datetimestamp: flags.boolean({
      char: 'd',
      description: 'adds datetime stamp before output filename',
      default: false
    }),
    removemarkup: flags.boolean({
      char: 'r',
      description: 'Remove paragraph numbers and other markup in output',
      default: false
    }),
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false
    }),
    showWritingRate: flags.string({
      char: 's',
      description: 'Show word count per day in varying details',
      options: ['all', 'short', 'none', 'export'],
      default: 'short'
    })
  }

  static aliases = ['compile']
  static hidden = false

  //TODO: if config is in YAML, export metadata in YAML?
  async run() {
    debug('Running Build command')
    const { flags } = this.parse(Build)

    const removeMarkup = flags.removemarkup
    const compact = flags.compact

    const wrOption = flags.showWritingRate
    const showWritingRate = wrOption === 'all' || wrOption === 'short' || wrOption === 'export'
    const showWritingRateDetails = wrOption === 'all' || wrOption === 'export'
    const exportWritingRate = wrOption === 'export'

    const outputFileBase = this.fsUtils.sanitizeFileName(this.configInstance.config.projectTitle)
    const outputFile = `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${outputFileBase}`

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

    await this.CommitToGit('Autosave before build')

    await this.markupUtils.UpdateAllMetadataFields()

    const tmpMDfile = await tmpFile()
    const tmpMDfileTex = await tmpFile()
    debug(`temp files = ${tmpMDfile.path} and ${tmpMDfileTex.path}`)

    const buildDirectory = this.configInstance.buildDirectory
    await this.fsUtils.createSubDirectoryFromDirectoryPathIfNecessary(buildDirectory)

    try {
      const originalChapterFilesArray = (await this.fsUtils.globPromise(
        path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcard(false))
      )).sort()

      const allChapterFilesArray = originalChapterFilesArray.concat(
        await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcard(true)))
      )

      await this.extractGlobalMetadata(allChapterFilesArray, outputFile)

      cli.info('Extracting metadata for all chapters files'.actionStartColor())

      const allMetadataFilesArray = (await this.fsUtils.globPromise(
        path.join(this.configInstance.projectRootPath, this.configInstance.metadataWildcard(false))
      )).concat(await this.fsUtils.globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.metadataWildcard(true))))

      const metaExtractPromises: Promise<MetaObj[]>[] = []
      allMetadataFilesArray.forEach(m => {
        metaExtractPromises.push(this.extractMeta(m, exportWritingRate))
      })
      await Promise.all(metaExtractPromises).then(async fullMetaArray => {
        //flatten equivalent
        const flattenedMetaArray: MetaObj[] = ([] as MetaObj[]).concat(...fullMetaArray).filter(m => m.wordCountDiff !== 0)

        const diffByDate: any = {}

        const mappedDiffArray = flattenedMetaArray.map(m => ({ file: m.log.file, date: m.log.date.format('YYYY-MM-DD'), diff: m.wordCountDiff }))

        debug(`mappedArray=${JSON.stringify(mappedDiffArray.filter(d => d.date === moment().format('YYYY-MM-DD')), null, 2)}`)

        if (exportWritingRate) {
          cli.action.start('Writing rate CSV file'.actionStartColor())
          let csvContent = 'Date;Chapter Number;Word Count Diff\n'

          mappedDiffArray.forEach((m: { date: any; file: any; diff: any }) => {
            const isAtNumbering = this.configInstance.isAtNumbering(m.file)
            const chapterNumberMatch = this.configInstance.metadataRegex(isAtNumbering).exec(m.file)
            const chapterNumber = chapterNumberMatch ? (isAtNumbering ? '@' : '') + chapterNumberMatch[1] : '?'
            csvContent += `${m.date};${chapterNumber};${m.diff}\n`
          })
          const writingRateFilePath = path.join(this.configInstance.buildDirectory, 'writingRate.csv')
          await this.fsUtils.writeFile(writingRateFilePath, csvContent)
          cli.action.stop(`Created ${writingRateFilePath}`.actionStopColor())
        }

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
                  const isAtNumbering = this.configInstance.isAtNumbering(metafile)
                  const chapterNumberMatch = this.configInstance.metadataRegex(isAtNumbering).exec(metafile)
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

      cli.action.start('Compiling and generating output files'.actionStartColor())

      let fullOriginalContent = this.configInstance.globalMetadataContent
      for (const file of originalChapterFilesArray) {
        fullOriginalContent += '\n' + (await this.fsUtils.readFileContent(file))
      }
      const fullCleanedOrTransformedContent = removeMarkup
        ? this.markupUtils.cleanMarkupContent(fullOriginalContent)
        : this.transformMarkupContent(fullOriginalContent)
      await this.fsUtils.writeInFile(tmpMDfile.fd, fullCleanedOrTransformedContent)
      await this.fsUtils.writeInFile(tmpMDfileTex.fd, fullCleanedOrTransformedContent.replace(/^\*\s?\*\s?\*$/gm, '\\asterism'))

      let chapterFiles = '"' + tmpMDfile.path + '" '

      const pandocRuns: Promise<void>[] = []
      const allOutputFilePath: string[] = []

      for (const filetype of outputFiletype) {
        // outputFiletype.forEach(filetype => {
        const fullOutputFilePath = path.join(buildDirectory, outputFile + '.' + filetype)
        allOutputFilePath.push(fullOutputFilePath)

        let pandocArgs: string[] = [] // [chapterFiles, '--smart', '--standalone', '-o', `"${fullOutputFilePath}"`]

        if (filetype === 'md') {
          pandocArgs = pandocArgs.concat(['--number-sections', '--to', 'markdown-raw_html', '--wrap=none', '--atx-headers'])
        }

        if (filetype === 'docx') {
          const referenceDocFullPath = path.join(this.hardConfig.configPath, 'reference.docx')
          if (await this.fsUtils.fileExists(referenceDocFullPath)) {
            pandocArgs = pandocArgs.concat([`--reference-docx="${referenceDocFullPath}"`])
          } else {
            this.warn(`For a better output, create an empty styled Word doc at ${referenceDocFullPath}`)
          }
          pandocArgs = pandocArgs.concat(['--toc', '--toc-depth', '2', '--top-level-division=chapter', '--number-sections'])
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
            'html5',
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
          if (this.fsUtils.fileExists(templateFullPath)) {
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
            '--latex-engine=xelatex',
            '--to',
            'latex+raw_tex'
          ])
        }

        if (filetype === 'epub') {
          pandocArgs = pandocArgs.concat(['--toc', '--toc-depth', '2', '--top-level-division=chapter', '--number-sections'])
        }

        pandocArgs = [chapterFiles, '--smart', '--standalone', '-o', `"${fullOutputFilePath}"`].concat(pandocArgs)

        try {
          pandocRuns.push(this.runPandoc(pandocArgs))
        } catch (err) {
          this.error(err.toString().errorColor())
          cli.action.status = 'error'.errorColor()
          this.exit(1)
        }
      }

      await Promise.all(pandocRuns)

      const allOutputFilePathPretty = allOutputFilePath.reduce((previous, current) => `${previous}\n    ${current}`, '')
      cli.action.stop(allOutputFilePathPretty.actionStopColor())

      if (compact) {
        await this.compactFileNumbers()
        await this.CommitToGit('Compacted file numbers')
      }
    } catch (err) {
      cli.action.status = 'error'.errorColor()
      this.error(err.toString().errorColor())
      this.exit(1)
    } finally {
      await tmpMDfile.cleanup()
      await tmpMDfileTex.cleanup()
    }
  }

  private async extractGlobalMetadata(allChapterFilesArray: string[], outputFile: string) {
    cli.action.start('Extracting global metadata'.actionStartColor())

    const table = tableize('file', 'diff')
    const extractPromises: Promise<MarkupObj[]>[] = []
    allChapterFilesArray.forEach(cf => {
      extractPromises.push(this.markupUtils.extractMarkup(cf))
    })
    await Promise.all(extractPromises).then(async fullMarkupArray => {
      const flattenedMarkupArray: MarkupObj[] = ([] as MarkupObj[]).concat(...fullMarkupArray)

      const { markupByFile, markupByType } = this.markupUtils.objectifyMarkupArray(flattenedMarkupArray)

      const markupExt = this.configInstance.configStyle.toLowerCase()
      const allMarkups = [
        { markupObj: markupByFile, fullPath: path.join(this.configInstance.buildDirectory, `${outputFile}.markupByFile.${markupExt}`) },
        { markupObj: markupByType, fullPath: path.join(this.configInstance.buildDirectory, `${outputFile}.markupByType.${markupExt}`) }
      ]

      for (const markup of allMarkups) {
        const existingMarkupContent = await this.fsUtils.readFileContent(markup.fullPath)

        const comparedString =
          this.configInstance.configStyle === 'JSON5'
            ? JSON.stringify(markup.markupObj, null, 4)
            : this.configInstance.configStyle === 'YAML'
            ? yaml.safeDump(markup.markupObj)
            : ''
        if (existingMarkupContent !== comparedString) {
          await this.fsUtils.writeFile(markup.fullPath, comparedString)
          table.accumulator(this.configInstance.mapFileToBeRelativeToRootPath(markup.fullPath), 'updated')
        }
      }

      const modifiedMetadataFiles = await this.markupUtils.writeMetadataInEachFile(markupByFile)
      table.accumulatorArray(modifiedMetadataFiles.map(val => ({ from: this.configInstance.mapFileToBeRelativeToRootPath(val.file), to: val.diff })))
      // markupFilenamesPretty = modifiedMetadataFiles.reduce((previous, current) => `${previous}\n    ${current}`,'')
    })

    cli.action.stop(`done`.actionStopColor())
    table.show()

    await this.CommitToGit('Autosave markup updates')
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

  private transformMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.markupUtils.paragraphBreakChar + '{{(\\d+)}}\\n', 'g')
    let markupCounter = 0

    const transformInFootnote = function(initial: string): { replaced: string; didReplacement: boolean } {
      let didReplacement = false
      const replaced = initial.replace(/(.*){(.*?)\s?:\s?(.*?)} *(.*)$/m, (_full, one, two, three, four) => {
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

    let continueReplacing = true
    while (continueReplacing) {
      const { replaced, didReplacement } = transformInFootnote(replacedContent)
      replacedContent = replaced
      continueReplacing = didReplacement
    }

    return replacedContent
  }

  private async extractMeta(filepath: string, extractAll: boolean): Promise<MetaObj[]> {
    const file = this.configInstance.mapFileToBeRelativeToRootPath(filepath)
    const beginBlock = '########'
    const endFormattedBlock = '------------------------ >8 ------------------------'
    const gitLogArgs = ['log', '-c', '--follow', `--pretty=format:"${beginBlock}%H;%aI;%s${endFormattedBlock}"`]
    if (!extractAll) {
      gitLogArgs.push(`--since="${moment().add(-1, 'week')}"`)
    }
    const logListString = (await this.git.raw([...gitLogArgs, file])) || ''
    const logList = logListString
      .split(beginBlock)
      .filter(l => l !== '')
      .map(l => {
        const s = l.split(endFormattedBlock)
        const logArray = s[0].split(';')
        const log = { file, hash: logArray[0], date: moment(logArray[1]), subject: logArray[2] }

        const wcRegex = /^([+-])\s*\"wordCount\": (\d+)/
        const diffArray = s.length === 2 ? s[1].split('\n').filter(n => n !== '' && wcRegex.test(n)) : []

        const wordCountDiff = diffArray
          .map(d => {
            const match = wcRegex.exec(d)
            return match ? parseInt(`${match[1]}${match[2]}`, 10) : 0
          })
          .reduce((previous, current) => {
            return previous + current
          }, 0)

        return { log, wordCountDiff }
      })

    return logList
  }
}

interface MetaObj {
  log: {
    file: string
    hash: string
    date: moment.Moment
    subject: string
  }
  wordCountDiff: number
}
