import { flags } from '@oclif/command'
import { exec } from 'child_process';
import cli from 'cli-ux'
import * as fs from 'fs'
import * as moment from 'moment';
import * as path from "path";
import { file as tmpFile } from 'tmp-promise'

import { QueryBuilder } from '../queries';

import { d, globPromise, readFile, writeFile, writeInFile } from './base';
import Command from "./edit-save-base"

const debug = d('command:build')

export default class Build extends Command {
  static readonly exportableFileTypes = ['md', 'pdf', 'docx', 'html', 'epub', 'tex']

  static description = `Takes all original .MD files and outputs a single file without metadata and comments.  Handles these output formats: ${Build.exportableFileTypes.join(', ')}`

  static flags = {
    ...Command.flags,
    filetype: flags.string({
      char: 't',
      description: 'filetype to export in.  Can be set multiple times.',
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
    })
  }

  static args = [
    {
      name: 'outputfile',
      default: '',
      description: "output filename, without extension, concatenating all other files's contents"
    }
  ]

  static aliases = ['compile']

  static hidden = false

  async run() {
    const { args, flags } = this.parse(Build)

    const removeMarkup = flags.removemarkup
    const compact = flags.compact

    const outputFileBase = args.outputfile || this.configInstance.config.projectTitle
    const outputFile = `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${outputFileBase}`

    let outputFiletype = flags.filetype
    if (!outputFiletype) {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('type', queryBuilder.checkboxinput(Build.exportableFileTypes, "Which filetype(s) to output?", ["md"]))
      const queryResponses: any = await queryBuilder.responses()
      outputFiletype = queryResponses.type
    }
    debug(`outputFileTypes= ${JSON.stringify(outputFiletype)}`)

    // await Save.run([`--path=${flags.path}`, '--no-warning', 'Autosave before build'])
    const toStageFiles = await this.GetGitListOfStageableFiles(null, false)
    await this.CommitToGit('Autosave before build', toStageFiles)

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

      debug(`originalChapterFilesArray: \n${originalChapterFilesArray}`)
      debug(`allChapterFilesArray: \n${allChapterFilesArray}`)

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

      const toStageFiles = await this.GetGitListOfStageableFiles(null, false)
      await this.CommitToGit('Autosave markup updates', toStageFiles)


      let fullOriginalContent = this.configInstance.globalMetadataContent
      for (const file of originalChapterFilesArray) {
        fullOriginalContent += '\n' + await this.readFileContent(file)
      }
      debug(`fullOriginalContent=\n${fullOriginalContent}`)
      const fullCleanedOrTransformedContent = removeMarkup ? this.cleanMarkupContent(fullOriginalContent) : this.transformMarkupContent(fullOriginalContent)
      await writeInFile(tempMetadataFd, fullCleanedOrTransformedContent)

      const chapterFiles = '"' + tempMetadataPath + '" '

      const pandocRuns: Promise<void>[] = []
      const allOutputFilePath: string[] = []
      const buildDirectory = this.context.getBuildDirectory()

      outputFiletype.forEach(filetype => {
        const fullOutputFilePath = path.join(buildDirectory, outputFile + '.' + filetype)
        allOutputFilePath.push(fullOutputFilePath)
        debug(`fullOutputFilePath= ${fullOutputFilePath}`)

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
        cli.action.start('Compacting file numbers')
        await this.compactFileNumbers()
        // await Save.run([`--path=${flags.path}`, 'Compacted file numbers'])
        const toStageFiles = await this.GetGitListOfStageableFiles(null, false)
        await this.CommitToGit('Compacted file numbers', toStageFiles)
        cli.action.stop()
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
      debug(`before executing child process with command ${command}`)
      exec(command, (err, pout, perr) => {
        debug('finished child process')
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

  // private async cleanMarkup(filepath: string): Promise<void> {
  //   try {
  //     const initialContent = await this.readFileContent(filepath)
  //     const replacedContent = this.cleanMarkupContent(initialContent)

  //     await writeFile(filepath, replacedContent, 'utf8')
  //   } catch (error) {
  //     this.error(error)
  //     this.exit(1)
  //   }
  // }

  private cleanMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{\\d+}}\\n', 'g')
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\s?', 'g')

    const replacedContent = initialContent.replace(paragraphBreakRegex, '')
      .replace(/{.*?:.*?} ?/gm, ' ')
      .replace(sentenceBreakRegex, '  ')

    return replacedContent
  }

  // private async transformMarkup(filepath: string): Promise<void> {
  //   try {
  //     const initialContent = await this.readFileContent(filepath)
  //     const replacedContent = this.transformMarkupContent(initialContent)

  //     await writeFile(filepath, replacedContent, 'utf8')
  //   } catch (error) {
  //     this.error(error)
  //     this.exit(1)
  //   }
  // }

  private transformMarkupContent(initialContent: string): string {
    const paragraphBreakRegex = new RegExp(this.paragraphBreakChar + '{{(\\d+)}}\\n', 'g')
    let markupCounter = 0 // markupCounter || 1

    const transformInFootnote = function (initial: string): { replaced: string, didReplacement: boolean } {
      let didReplacement = false
      const replaced = initial.replace(/(.*){(.*?)\s?:\s?(.*?)} *(.*)$/m, (full, one, two, three, four) => {
        markupCounter++
        debug(`full: ${full} one: ${one} two: ${two} three:${three} four:${four}`)
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
    //   .replace(/(.*){(.*?)\s?:\s?(.*?)} *(.*)$/m, (full, one, two, three, four) => {
    //   markupCounter++
    //   debug(`full: ${full} one: ${one} two: ${two} three:${three} four:${four}`)
    //   return `${one} ~_${two}_~[^${markupCounter}]  ${four}\n\n[^${markupCounter}]: ${three}\n\n`
    // })

    debug(`transformedMarkup: ${replacedContent}`)
    return replacedContent
  }

  private async extractMarkup(filepath: string): Promise<MarkupObj[]> {
    const resultArray: MarkupObj[] = []
    try {
      const initialContent = await this.readFileContent(filepath)
      const markupRegex = /(?:{{(\d+)}}\n)?.*?{(.*?)\s?:\s?(.*?)}/gm //  /(?:{{(\d+)}}\n)?.*{(.*)\s?:\s?(.*)}/gm
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
      debug(`***Markup: ${JSON.stringify(markup, null, 2)}`)
      markupByFile[markup.filename] = markupByFile[markup.filename] || []
      if (markup.computed) {
        markupByFile[markup.filename].push({ computed: true, type: markup.type, value: markup.value })
      } else {
        markupByFile[markup.filename].push({ computed: false, paragraph: markup.paragraph, type: markup.type, value: markup.value })
      }

      if (!markup.computed) {
        markupByType[markup.type] = markupByType[markup.type] || []
        markupByType[markup.type].push({ filename: markup.filename, paragraph: markup.paragraph, value: markup.value })
      }

    })
    return { markupByFile, markupByType }
  }

  private async writeMetadataInEachFile(markupByFile: any) {
    for (const file of Object.keys(markupByFile)) {
      const extractedMarkup: any = {}
      const computedMarkup: any = {}
      const markupArray = markupByFile[file]
      debug(`file: ${file} markup: ${JSON.stringify(markupArray)}`)
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

      debug(`markupForFile: ${JSON.stringify(extractedMarkup, null, 2)}`)
      const num = this.context.extractNumber(file)
      const isAt = this.configInstance.isAtNumbering(file)
      const metadataFilename = await this.context.getMetadataFilenameFromParameters(num, isAt)
      const buff = await readFile(path.join(this.configInstance.projectRootPath, metadataFilename))
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)
      const obj = JSON.parse(initialContent)
      obj.extracted = extractedMarkup
      obj.computed = computedMarkup

      debug(`metadataFilename: ${metadataFilename} obj: \n${JSON.stringify(obj, null, 2)}`)
      await writeFile(path.join(this.configInstance.projectRootPath, metadataFilename), JSON.stringify(obj, null, 4))
    }

  }

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
