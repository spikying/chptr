import { flags } from '@oclif/command'
import { exec } from 'child_process';
import cli from 'cli-ux'
// import {boolean} from '@oclif/parser/lib/flags'
import * as d from 'debug';
import * as fs from 'fs'
import * as glob from "glob";
import * as inquirer from 'inquirer'
import * as minimatch from 'minimatch'
import * as moment from 'moment';
import * as notifier from 'node-notifier'
import * as path from "path";
import { file as tmpFile } from 'tmp-promise'
import { promisify } from "util";

import { QueryBuilder } from '../common';

import Command from "./base"

const debug = d('command:build')
const writeInFile = promisify(fs.write);

export default class Build extends Command {
  static readonly exportableFileTypes = ['md', 'pdf', 'docx', 'html', 'epub']

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
    notify: flags.boolean({
      char: 'n',
      description:
        'show a notification box when build is completed.  Use --no-notify to suppress notification',
      default: false,
      allowNo: true
    }),
    datetimestamp: flags.boolean({
      char: 'd',
      description: 'adds datetime stamp before output filename',
      default: false
    })
  }

  static args = [
    {
      name: 'outputfile',
      default: 'novel',
      description: "output file concatenating all other files's contents"
    }
  ]

  async run() {
    const { args, flags } = this.parse(Build)

    const outputFile = `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${args.outputfile}`

    let outputFiletype = flags.filetype
    if (!outputFiletype) {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('type', queryBuilder.checkboxinput(Build.exportableFileTypes, "Which filetype(s) to output?", ["md"]))
      const queryResponses: any = await queryBuilder.responses()
      outputFiletype = queryResponses.type
    }
    debug(`outputFileTypes= ${JSON.stringify(outputFiletype)}`)

    cli.action.start('Compiling Markdown files')

    const tmpResult = await tmpFile();
    const tempFd = tmpResult.fd
    const tempPath = tmpResult.path
    const tempCleanup = tmpResult.cleanup
    debug(`temp file = ${tempPath}`)

    try {
      await writeInFile(tempFd, this.configInstance.globalMetadataContent)

      const chapterFiles = '"' + tempPath + '" ' +
        glob.sync(path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcard))
          .sort()
          // .filter(f => !minimatch(f, this.configInstance.metadataWildcard))
          .map(f => `"${path.normalize(f)}"`)
          .join(' ')
      debug(`chapterFiles= ${chapterFiles}`)

      const fullOutputDirectory = path.join(this.configInstance.projectRootPath, this.configInstance.buildDirectory)
      if (!fs.existsSync(fullOutputDirectory)) {
        fs.mkdirSync(fullOutputDirectory)
      }

      const pandocRuns: Promise<void>[] = []
      const allOutputFilePath: string[] = []

      outputFiletype.forEach(filetype => {
        const fullOutputFilePath = path.join(fullOutputDirectory, outputFile + '.' + filetype)
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

        if (filetype === 'pdf') {
          const templateFullPath = path.join(this.configInstance.configPath, 'template.latex')
          if (fs.existsSync(templateFullPath)) {
            pandocArgs = pandocArgs.concat([`--template`, `"${templateFullPath}"`])
          }
          else {
            this.warn(`For a better output, create a latex template at ${templateFullPath}`)
          }

          pandocArgs = pandocArgs.concat(['--toc', '--toc-depth', '2', '--top-level-division=chapter', '--number-sections']) //
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

        cli.info(`Generating ${fullOutputFilePath}`)
      })

      await Promise.all(pandocRuns)
      cli.action.stop()

      if (flags.notify) {
        notifier.notify({
          title: 'Spix Novel Builder',
          message: `Build complete for ${allOutputFilePath.join(', ')}`
        })
      }
      cli.info(`Build complete for all files`)
    } catch (err) {
      this.error(err)
      this.exit(1)
    } finally {
      await tempCleanup()
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

}
