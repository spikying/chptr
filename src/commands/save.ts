import { flags } from '@oclif/command'
import { cli } from "cli-ux";
import * as d from 'debug';
import * as fs from 'fs';
// import * as glob from "glob";
import * as minimatch from 'minimatch'
import * as path from "path";
import * as simplegit from 'simple-git/promise';
import { promisify } from "util";

import { QueryBuilder } from '../common';
import { mapFilesToBeRelativeToRootPath, filterNumbers, walk } from '../helpers';

import Command from "./base";
import { integer } from '@oclif/parser/lib/flags';

const debug = d('command:save')
// const listFiles = promisify(glob);
const openFile = promisify(fs.open)
const fileStats = promisify(fs.stat)
const readOpenedFile = promisify(fs.read)
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const closeFile = promisify(fs.close)

export default class Save extends Command {
  static description = 'Parse modified text files, adjust sentence and paragraph endings, commit files to repository and readjust endings.'

  static flags = {
    ...Command.flags,
    filter: flags.string({
      char: 'f',
      required: false,
      default: '',
      parse: filterNumbers,
      description: 'Chapter number to filter which files to stage before saving to repository'
    })
  }

  static args = [{
    name: 'message',
    description: 'Message to use in commit to repository',
    required: false,
    default: ''
  }]

  private readonly sentenceBreakChar = '\u200D'// '\u000D' // '\u2028'

  async run() {
    const { args, flags } = this.parse(Save)

    const numberFilter = flags.filter ? parseInt(flags.filter, 10) : undefined

    const queryBuilder = new QueryBuilder()
    // debug(`args.message = ${args.message}`)
    if (!args.message) {
      queryBuilder.add('message', queryBuilder.textinput("Message to use in commit to repository?", ""))
    }

    const queryResponses: any = await queryBuilder.responses()

    const git = simplegit(this.configInstance.projectRootPath);
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      throw new Error("Directory is not a repository")
    }

    // const pathName = path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber())
    const toAddFiles = (await git.diff(['--name-only']))
      .split('\n')
      .filter(val => val !== '')
      .filter(val => {
        // debug(`numberFilter=${numberFilter}; val=${val}; minimatch=${minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter || 0))}`)
        return numberFilter ? minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter)) : true
      }) // listFiles(pathName)
    debug(`toAddFiles: ${JSON.stringify(toAddFiles)}`)

    if (toAddFiles.length === 0) {
      this.error('No files to save to repository')
      this.exit(0)
    }

    cli.action.start('Reading and processing modified files')
    await toAddFiles.forEach(async filename => {
      const fullPath = path.join(this.configInstance.projectRootPath, filename)
      await this.processFileBack(fullPath)
      await this.processFile(fullPath)
    });
    cli.action.stop()

    let message: any = args.message || queryResponses.message || 'Modified files:'
    message += '\n' + `${JSON.stringify(toAddFiles)}`
    debug(`message: ${message}`)

    try {
      cli.action.start('Saving file(s) in repository')

      debug(`Message= ${message}; toAddFiles=${JSON.stringify(toAddFiles)}`)

      await git.commit(message, toAddFiles)
      await git.push()
      await git.pull()

    } catch (err) {
      this.error(err)
    } finally {
      cli.action.stop()
    }

    // cli.action.start('Processing back files')
    // await toAddFiles.forEach(async filename => {
    //   const fullPath = path.join(this.configInstance.projectRootPath, filename)
    //   await this.processFileBack(fullPath)
    // });
    // cli.action.stop()
  }

  private async processFile(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)
      let paraCounter = 1
      // \u2028 = line sep  \u200D = zero width joiner
      const replacedContent = initialContent.replace(/([.!?…"]) {2}([A-ZÀ-Ú])/gm, '$1' + this.sentenceBreakChar + '\n$2')
        .replace(/([.!?…"])\n{2}([A-ZÀ-Ú])/gm, (full, one, two) => {
          paraCounter++
          // return `$1\u2029\n\n$2{{${paraCounter}}}`
          debug(`full: ${full} one: ${one} two: ${two}`)
          return `${one}\n\n\u2029{{${paraCounter}}}\n${two}`
        })
      debug(`Processed content: \n${replacedContent.substring(0, 250)}`)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

  private async processFileBack(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)
      const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\n', 'gm')
      const replacedContent = initialContent.replace(sentenceBreakRegex, '  ')
        .replace(/\n\n\u2029{{\d+}}\n/gm, '\n\n')
      debug(`Processed back content: \n${replacedContent.substring(0, 250)}`)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

}
