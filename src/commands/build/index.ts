import { flags } from '@oclif/command'
import { Input } from '@oclif/parser'
import { exec } from 'child_process'
import cli from 'cli-ux'
import yaml = require('js-yaml')
import * as path from 'path'
import { file as tmpFile } from 'tmp-promise'

import { BootstrapChptr } from '../../bootstrap-functions'
import { ChapterId } from '../../chapter-id'
import { ChptrError } from '../../chptr-error'
import { QueryBuilder } from '../../ui-utils'
import { d } from '../base'

import Command from './metadata'

const debug = d('build')

export default class Build extends Command {
  static readonly exportableFileTypes = ['md', 'pdf', 'docx', 'html', 'epub', 'tex']

  static description = `Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: ${Build.exportableFileTypes.join(
    ', '
  )}.  Gives some insight into writing rate.`

  static flags = {
    ...Command.flags,
    type: flags.string({
      char: 't',
      description: 'filetype to export to.  Can be set multiple times.',
      options: Build.exportableFileTypes.concat('all'),
      default: '',
      multiple: true
    }),
    removemarkup: flags.boolean({
      char: 'r',
      description: 'Remove paragraph numbers and clean markup in output',
      default: false
    }),
    withsummaries: flags.boolean({
      char: 'S',
      description: 'Add summaries in output, before actual content',
      default: false
    })
  }

  static aliases = ['compile']
  static hidden = false

  async run() {
    debug('Running Build command')

    // const tmpMDfile = await tmpFile()
    // const tmpMDfileTex = await tmpFile()
    // debug(`temp files = ${tmpMDfile.path} and ${tmpMDfileTex.path}`)

    // try {
      const { flags } = this.parse(this.constructor as Input<any>)

      await this.RunMetadata(flags)

      const removeMarkup = flags.removemarkup
      const withSummaries = flags.withsummaries

      let outputFiletype = flags.type
      if (!outputFiletype) {
        const queryBuilder = new QueryBuilder()
        queryBuilder.add('type', queryBuilder.checkboxinput(Build.exportableFileTypes, 'Which filetype(s) to output?', ['md']))
        const queryResponses: any = await queryBuilder.responses()
        outputFiletype = queryResponses.type
      }
      if (outputFiletype.indexOf('all') >= 0) {
        outputFiletype = Build.exportableFileTypes
      }

      await this.coreUtils.buildOutput(removeMarkup, withSummaries, outputFiletype, this.outputFile)
      // const originalChapterFilesArray = (await this.fsUtils.listFiles(
      //   path.join(this.rootPath, this.softConfig.chapterWildcard(false))
      // )).sort()

      // cli.action.start('Compiling and generating output files'.actionStartColor())

      // let fullOriginalContent = this.softConfig.globalMetadataContent

      // const bootstrapChptr = new BootstrapChptr(this.rootPath)

      // for (const file of originalChapterFilesArray) {
      //   fullOriginalContent += '\n'
      //   const chapterContent = await this.fsUtils.readFileContent(file)
      //   if (withSummaries) {
      //     const number = this.softConfig.extractNumber(file)
      //     const chapterId = new ChapterId(number, false)

      //     const summaryFile = (await this.fsUtils.listFiles(
      //       path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(chapterId))
      //     ))[0]
      //     const summaryContent = await this.fsUtils.readFileContent(summaryFile)
      //     const summaryRE = /^(?!# )(.+)$/gm
      //     fullOriginalContent += summaryContent.replace(/^{{\d+}}$/gm, '').replace(summaryRE, '> *$1*')
      //     fullOriginalContent += '\n\n````\n'

      //     const metadataFile = (await this.fsUtils.listFiles(
      //       path.join(this.rootPath, this.softConfig.metadataWildcardWithNumber(chapterId))
      //     ))[0]
      //     const metadataContent = await this.fsUtils.readFileContent(metadataFile)
      //     const metadataObj = this.softConfig.parsePerStyle(metadataContent)
      //     let filteredMetadataObj: any = bootstrapChptr.deepCopy(metadataObj)

      //     fullOriginalContent += yaml.safeDump(filteredMetadataObj) //.replace(/\n/g, '\n\n')
      //     fullOriginalContent += '````\n\n'

      //     const chapterRE = /# (.*)\n/
      //     fullOriginalContent += chapterContent.replace(chapterRE, '***\n')
      //   } else {
      //     fullOriginalContent += chapterContent
      //   }
      // }
      // const fullCleanedOrTransformedContent = removeMarkup
      //   ? this.markupUtils.cleanMarkupContent(fullOriginalContent)
      //   : this.markupUtils.transformMarkupContent(fullOriginalContent)
      // await this.fsUtils.writeInFile(tmpMDfile.fd, fullCleanedOrTransformedContent)
      // await this.fsUtils.writeInFile(
      //   tmpMDfileTex.fd,
      //   fullCleanedOrTransformedContent.replace(/^\*\s?\*\s?\*$/gm, '\\asterism').replace(/\u200B/g, '')
      // )

      // let chapterFiles = '"' + tmpMDfile.path + '" '

      // const pandocRuns: Promise<void>[] = []
      // const allOutputFilePath: string[] = []

      // for (const filetype of outputFiletype) {
      //   const fullOutputFilePath = path.join(this.softConfig.buildDirectory, this.outputFile + '.' + filetype)
      //   allOutputFilePath.push(fullOutputFilePath)

      //   let pandocArgs: string[] = ['--strip-comments']

      //   if (filetype === 'md') {
      //     pandocArgs = pandocArgs.concat(['--number-sections', '--to', 'markdown-raw_html+smart+fancy_lists', '--wrap=none', '--atx-headers'])
      //   }

      //   if (filetype === 'docx') {
      //     const referenceDocFullPath = path.join(this.hardConfig.configPath, 'reference.docx')
      //     if (await this.fsUtils.fileExists(referenceDocFullPath)) {
      //       pandocArgs = pandocArgs.concat([`--reference-doc="${referenceDocFullPath}"`])
      //     } else {
      //       this.warn(`For a better output, create an empty styled Word doc at ${referenceDocFullPath}`)
      //     }
      //     pandocArgs = pandocArgs.concat([
      //       '--to',
      //       'docx+smart+fancy_lists',
      //       '--toc',
      //       '--toc-depth',
      //       '2',
      //       '--top-level-division=chapter',
      //       '--number-sections'
      //     ])
      //   }

      //   if (filetype === 'html') {
      //     const templateFullPath = path.join(this.hardConfig.configPath, 'template.html')
      //     if (await this.fsUtils.fileExists(templateFullPath)) {
      //       pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
      //     } else {
      //       this.warn(`For a better output, create an html template at ${templateFullPath}`)
      //     }

      //     const cssFullPath = path.join(this.hardConfig.configPath, 'template.css')
      //     if (await this.fsUtils.fileExists(cssFullPath)) {
      //       pandocArgs = pandocArgs.concat([`--css`, `"${cssFullPath}"`])
      //     } else {
      //       this.warn(`For a better output, create a css template at ${cssFullPath}`)
      //     }

      //     pandocArgs = pandocArgs.concat([
      //       '--to',
      //       'html5+smart+fancy_lists',
      //       '--toc',
      //       '--toc-depth',
      //       '2',
      //       '--top-level-division=chapter',
      //       '--number-sections',
      //       '--self-contained'
      //     ])
      //   }

      //   if (filetype === 'pdf' || filetype === 'tex') {
      //     chapterFiles = '"' + tmpMDfileTex.path + '" '

      //     const templateFullPath = path.join(this.hardConfig.configPath, 'template.latex')
      //     if (await this.fsUtils.fileExists(templateFullPath)) {
      //       pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
      //     } else {
      //       this.warn(`For a better output, create a latex template at ${templateFullPath}`)
      //     }

      //     pandocArgs = pandocArgs.concat([
      //       '--toc',
      //       '--toc-depth',
      //       '2',
      //       '--top-level-division=chapter',
      //       '--number-sections',
      //       '--pdf-engine=xelatex',
      //       '--to',
      //       'latex+raw_tex+smart+fancy_lists'
      //     ])
      //   }

      //   if (filetype === 'epub') {
      //     pandocArgs = pandocArgs.concat([
      //       '--to',
      //       'epub+smart+fancy_lists',
      //       '--toc',
      //       '--toc-depth',
      //       '2',
      //       '--top-level-division=chapter',
      //       '--number-sections'
      //     ])
      //   }

      //   pandocArgs = [
      //     chapterFiles,
      //     '--standalone',
      //     '-o',
      //     `"${fullOutputFilePath}"`
      //   ].concat(pandocArgs)

      //   pandocRuns.push(this.runPandoc(pandocArgs))
      // }

      // await Promise.all(pandocRuns).catch(err => {
      //   throw new ChptrError(
      //     `Error trying to run Pandoc.  You need to have it installed and accessible globally, with version 2.7.3 minimally.\n${err
      //       .toString()
      //       .errorColor()}`,
      //     'command:build:index',
      //     52
      //   )
      // })

      // const allOutputFilePathPretty = allOutputFilePath.reduce((previous, current) => `${previous}\n    ${current}`, '')
      // cli.action.stop(allOutputFilePathPretty.actionStopColor())

    // } catch (err) {
    //   throw new ChptrError(err, 'build.run', 3)
    // } finally {
    //   await tmpMDfile.cleanup()
    //   await tmpMDfileTex.cleanup()
    // }
  }

  // private async runPandoc(options: string[]): Promise<void> {
  //   return new Promise((resolve, reject) => {
  //     const command = 'pandoc ' + options.join(' ')
  //     debug(`Executing child process with command ${command}`)
  //     exec(command, (err, pout, perr) => {
  //       if (err) {
  //         this.error(err.toString().errorColor())
  //         reject(err)
  //       }
  //       if (perr) {
  //         this.error(perr.toString().errorColor())
  //         reject(perr)
  //       }
  //       if (pout) {
  //         this.log(pout)
  //       }
  //       resolve()
  //     })
  //   })
  // }
}
