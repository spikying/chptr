import { flags } from '@oclif/command'
import { exec } from 'child_process';
import cli from 'cli-ux'
import * as fs from 'fs'
import * as moment from 'moment';
import * as path from "path";
import { file as tmpFile } from 'tmp-promise'

import { QueryBuilder } from '../queries';

import { d, globPromise, readFile, sanitizeFileName, writeFile, writeInFile} from './base';
import Command from "./edit-save-base"
const chalk: any = require('chalk')

const debug = d('command:build')

export default class Build extends Command {
  static readonly exportableFileTypes = ['md', 'pdf', 'docx', 'html', 'epub', 'tex']

  static description = `Takes all original .MD files and outputs a single file without metadata and comments.  Handles these output formats: ${Build.exportableFileTypes.join(', ')}`

  static flags = {
    ...Command.flags,
    filetype: flags.string({
      char: 't',
      description: 'filetype to export to.  Can be set multiple times.',
      options: Build.exportableFileTypes,
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
      description: 'Remove paragraph numbers and other markup',
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

  async run() {
    const { flags } = this.parse(Build)

    const removeMarkup = flags.removemarkup
    const compact = flags.compact

    const wrOption = flags.showWritingRate
    const showWritingRate = wrOption === 'all' || wrOption === 'short' || wrOption === 'export'
    const showWritingRateDetails = wrOption === 'all' || wrOption === 'export'
    const exportWritingRate = wrOption === 'export'

    const outputFileBase = sanitizeFileName(this.configInstance.config.projectTitle)
    const outputFile = `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${outputFileBase}`

    let outputFiletype = flags.filetype
    if (!outputFiletype) {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('type', queryBuilder.checkboxinput(Build.exportableFileTypes, "Which filetype(s) to output?", ["md"]))
      const queryResponses: any = await queryBuilder.responses()
      outputFiletype = queryResponses.type
    }

    await this.CommitToGit('Autosave before build')

    cli.action.start('Compiling and generating Markdown files')

    const tmpMetadataResult = await tmpFile();
    const tempMetadataFd = tmpMetadataResult.fd
    const tempMetadataPath = tmpMetadataResult.path
    const tempMetadataCleanup = tmpMetadataResult.cleanup
    debug(`temp file = ${tempMetadataPath}`)

    try {
      const originalChapterFilesArray = (await globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcard(false))))
        .sort()

      const allChapterFilesArray = originalChapterFilesArray.concat(await globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcard(true))))

      const extractPromises: Promise<MarkupObj[]>[] = []
      allChapterFilesArray.forEach(c => {
        extractPromises.push(this.extractMarkup(c))
      })
      await Promise.all(extractPromises).then(async fullMarkupArray => {
        const flattenedMarkupArray: MarkupObj[] = ([] as MarkupObj[]).concat(...fullMarkupArray)

        const { markupByFile, markupByType } = this.objectifyMarkupArray(flattenedMarkupArray)

        await writeFile(path.join(this.configInstance.buildDirectory, `${outputFile}.markupByFile.json`), JSON.stringify(markupByFile, null, 4))
        await writeFile(path.join(this.configInstance.buildDirectory, `${outputFile}.markupByType.json`), JSON.stringify(markupByType, null, 4))

        await this.writeMetadataInEachFile(markupByFile)
      })

      await this.CommitToGit('Autosave markup updates')

      const allMetadataFilesArray = (await globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.metadataWildcard(false)))).concat(await globPromise(path.join(this.configInstance.projectRootPath, this.configInstance.metadataWildcard(true))))

      const metaExtractPromises: Promise<MetaObj[]>[] = []
      allMetadataFilesArray.forEach(m => {
        metaExtractPromises.push(this.extractMeta(m, exportWritingRate))
      })
      await Promise.all(metaExtractPromises).then(async fullMetaArray => {
        const flattenedMetaArray: MetaObj[] = ([] as MetaObj[]).concat(...fullMetaArray).filter(m => m.wordCountDiff !== 0)
        const diffByDate: any = {}

        const mappedDiffArray = flattenedMetaArray.map(m => ({ file: m.log.file, date: m.log.date.format('YYYY-MM-DD'), diff: m.wordCountDiff }))

        if (exportWritingRate) {
          cli.action.start('Writing rate CSV file')
          let csvContent = 'Date;Chapter Number;Word Count Diff\n'

          mappedDiffArray.forEach((m: { date: any; file: any; diff: any; }) => {
            const isAtNumbering = this.configInstance.isAtNumbering(m.file)
            const chapterNumberMatch = this.configInstance.metadataRegex(isAtNumbering).exec(m.file)
            const chapterNumber = chapterNumberMatch ? (isAtNumbering ? '@' : '') + chapterNumberMatch[1] : '?'
            csvContent += `${m.date};${chapterNumber};${m.diff}\n`
          })
          const writingRateFilePath = path.join(this.configInstance.buildDirectory, 'writingRate.csv')
          await writeFile(writingRateFilePath, csvContent)
          cli.action.stop(`Created ${writingRateFilePath}`)
        }

        mappedDiffArray.forEach((m: { date: any; file: any; diff: any; }) => {
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
          cli.info(`Writing rate:`)
          for (const date of Object.keys(diffByDate)) {
            const table: any[] = []
            const output = {
              summary: chalk`{whiteBright ${date}} ->\t{redBright ${(diffByDate[date].total)}}`,
              details: '',
              table
            }
            cli.info(output.summary)

            if (showWritingRateDetails) {
              for (const metafile of Object.keys(diffByDate[date])) {
                if (metafile !== 'total') {
                  const isAtNumbering = this.configInstance.isAtNumbering(metafile)
                  const chapterNumberMatch = this.configInstance.metadataRegex(isAtNumbering).exec(metafile)
                  let chapterNumber = chapterNumberMatch ? (isAtNumbering ? '@' : '') + chapterNumberMatch[1] : '?'
                  chapterNumber = chalk.gray(' '.repeat(14 - chapterNumber.length) + chapterNumber)
                  const wordDiff = chalk.magenta(diffByDate[date][metafile])

                  output.details += chalk`    {gray chapter file #} {blue ${(chapterNumber)}} ->\t{red ${(diffByDate[date][metafile])}}\n`
                  output.table.push({ chapterNumber, wordDiff })
                }
              }

              cli.table(output.table, {
                chapterNumber: {
                  header: chalk`{gray Chapter file #}`,
                  minWidth: 15
                },
                ' ->': {
                  get: () => ''
                },
                wordDiff: {
                  header: chalk`{gray Word diff}`
                }
              })
            }
          }
        }

      })


      let fullOriginalContent = this.configInstance.globalMetadataContent
      for (const file of originalChapterFilesArray) {
        fullOriginalContent += '\n' + await this.readFileContent(file)
      }
      const fullCleanedOrTransformedContent = removeMarkup ? this.cleanMarkupContent(fullOriginalContent) : this.transformMarkupContent(fullOriginalContent)
      await writeInFile(tempMetadataFd, fullCleanedOrTransformedContent)

      const chapterFiles = '"' + tempMetadataPath + '" '

      const pandocRuns: Promise<void>[] = []
      const allOutputFilePath: string[] = []
      const buildDirectory = this.context.getBuildDirectory()

      outputFiletype.forEach(filetype => {
        const fullOutputFilePath = path.join(buildDirectory, outputFile + '.' + filetype)
        allOutputFilePath.push(fullOutputFilePath)

        let pandocArgs = [chapterFiles, '--smart', '--standalone', '-o', `"${fullOutputFilePath}"`] //

        if (filetype === 'md') {
          pandocArgs = pandocArgs.concat(['--number-sections', '--to', 'markdown-raw_html', '--wrap=none', '--atx-headers'])
        }

        if (filetype === 'docx') {
          const referenceDocFullPath = path.join(this.configInstance.configPath, 'reference.docx')
          if (fs.existsSync(referenceDocFullPath)) {
            pandocArgs = pandocArgs.concat([`--reference-docx="${referenceDocFullPath}"`])
          }
          else {
            this.warn(`For a better output, create an empty styled Word doc at ${referenceDocFullPath}`)
          }
          pandocArgs = pandocArgs.concat(['--toc', '--toc-depth', '2', '--top-level-division=chapter', '--number-sections'])
        }

        if (filetype === 'html') {
          const templateFullPath = path.join(this.configInstance.configPath, 'template.html')
          if (fs.existsSync(templateFullPath)) {
            pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
          }
          else {
            this.warn(`For a better output, create an html template at ${templateFullPath}`)
          }

          const cssFullPath = path.join(this.configInstance.configPath, 'template.css')
          if (fs.existsSync(cssFullPath)) {
            pandocArgs = pandocArgs.concat([`--css`, `"${cssFullPath}"`])
          }
          else {
            this.warn(`For a better output, create a css template at ${cssFullPath}`)
          }

          pandocArgs = pandocArgs.concat(['--to', 'html5', '--toc', '--toc-depth', '2', '--top-level-division=chapter', '--number-sections', '--self-contained'])
        }

        if (filetype === 'pdf' || filetype === 'tex') {
          const templateFullPath = path.join(this.configInstance.configPath, 'template.latex')
          if (fs.existsSync(templateFullPath)) {
            pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
          }
          else {
            this.warn(`For a better output, create a latex template at ${templateFullPath}`)
          }

          pandocArgs = pandocArgs.concat(['--toc', '--toc-depth', '2', '--top-level-division=chapter', '--number-sections', '--latex-engine=xelatex']) //
        }

        if (filetype === 'epub') {
          pandocArgs = pandocArgs.concat(['--toc', '--toc-depth', '2', '--top-level-division=chapter', '--number-sections'])
        }

        try {
          pandocRuns.push(this.runPandoc(pandocArgs))
        } catch (err) {
          this.error(err)
          cli.action.status = "error"
          this.exit(1)
        }

      })

      await Promise.all(pandocRuns)

      cli.action.stop(JSON.stringify(allOutputFilePath))

      if (compact) {
        await this.compactFileNumbers()
        await this.CommitToGit('Compacted file numbers')
      }

    } catch (err) {
      cli.action.status = "error"
      this.error(err)
      this.exit(1)
    } finally {
      await tempMetadataCleanup()
    }
  }

  private async runPandoc(options: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = 'pandoc ' + options.join(' ')
      debug(`Executing child process with command ${command}`)
      exec(command, (err, pout, perr) => {
        if (err) {
          this.error(err)
          reject(err)
        }
        if (perr) {
          this.error(perr)
          reject(perr)
        }
        if (pout) {
          this.log(pout)
        }
        resolve()
      })

    })
  }

  private cleanMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{\\d+}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')

    const replacedContent = initialContent.replace(paragraphBreakRegex, '')
      .replace(/{.*?:.*?} ?/gm, ' ')
      .replace(sentenceBreakRegex, '  ')

    return replacedContent
  }

  private transformMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{(\\d+)}}\\n', 'g')
    let markupCounter = 0

    const transformInFootnote = function (initial: string): { replaced: string, didReplacement: boolean } {
      let didReplacement = false
      const replaced = initial.replace(/(.*){(.*?)\s?:\s?(.*?)} *(.*)$/m, (_full, one, two, three, four) => {
        markupCounter++
        didReplacement = didReplacement || (two && three)
        return `${one} ~_${two}_~[^${markupCounter}]  ${four}\n\n[^${markupCounter}]: ${three}\n\n`
      })
      return { replaced, didReplacement }
    }

    let replacedContent = initialContent.replace(paragraphBreakRegex, '^_($1)_^\t')

    let continueReplacing = true
    while (continueReplacing) {
      const { replaced, didReplacement } = transformInFootnote(replacedContent)
      replacedContent = replaced
      continueReplacing = didReplacement
    }

    return replacedContent
  }

  private async extractMarkup(filepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []
    try {
      const initialContent = await this.readFileContent(filepath)
      const markupRegex = /(?:{{(\d+)}}\n)?.*?{(.*?)\s?:\s?(.*?)}/gm
      let regexArray: RegExpExecArray | null
      while ((regexArray = markupRegex.exec(initialContent)) !== null) {
        resultArray.push(
          {
            filename: path.basename(filepath),
            paragraph: parseInt((regexArray[1] || '1'), 10),
            type: regexArray[2].toLowerCase(),
            value: regexArray[3],
            computed: false
          }
        )
      }
      const wordCount = this.GetWordCount(initialContent)
      resultArray.push({
        filename: path.basename(filepath),
        type: 'wordCount',
        value: wordCount,
        computed: true
      })
    } catch (error) {
      this.error(error)
      this.exit(1)
    }

    return resultArray
  }

  private GetWordCount(text: string): number {
    const wordRegex = require('word-regex')
    const cleanedText = this.cleanMarkupContent(text)
    const match = cleanedText.match(wordRegex())
    return match ? match.length : 0
  }

  private objectifyMarkupArray(flattenedMarkupArray: MarkupObj[]): { markupByFile: MarkupByFile, markupByType: any } {
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

  private async writeMetadataInEachFile(markupByFile: any) {
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
      });

      const num = this.context.extractNumber(file)
      const isAt = this.configInstance.isAtNumbering(file)
      const metadataFilename = await this.context.getMetadataFilenameFromParameters(num, isAt)
      const buff = await readFile(path.join(this.configInstance.projectRootPath, metadataFilename))
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)
      const obj = JSON.parse(initialContent)
      obj.extracted = extractedMarkup
      obj.computed = computedMarkup

      await writeFile(path.join(this.configInstance.projectRootPath, metadataFilename), JSON.stringify(obj, null, 4))
    }

  }

  private async extractMeta(filepath: string, extractAll: boolean): Promise<MetaObj[]> {
    const file = path.basename(filepath)
    const beginBlock = '########'
    const endFormattedBlock = '------------------------ >8 ------------------------';
    const gitLogArgs = ['log', '-c', '--follow', `--pretty=format:"${beginBlock}%H;%aI;%s${endFormattedBlock}"`]
    if (!extractAll) {
      gitLogArgs.push(`--since="${moment().add(-1, "week")}"`)
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

        const wordCountDiff = diffArray.map(d => {
          const match = wcRegex.exec(d)
          return match ? parseInt(`${match[1]}${match[2]}`, 10) : 0
        }).reduce((previous, current) => {
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

interface MarkupObj {
  filename: string
  paragraph?: number
  type: string
  value: string | number
  computed: boolean
}

interface MarkupByFile {
  [filename: string]: [{
    paragraph?: number
    type: string
    value: string | number
    computed: boolean
  }]
}
