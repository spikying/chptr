// import { flags } from '@oclif/command'

// import { filterNumbers } from '../helpers';

import { cli } from "cli-ux";
import * as minimatch from 'minimatch'
import { CommitSummary } from 'simple-git/typings/response';

import Command, { d, readFile, writeFile } from "./base";

const debug = d('command:edit-save-base')

export default abstract class extends Command {

  static flags = {
    ...Command.flags
  }

  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u000D'// '\u200D' // '\u2028'
  public readonly paragraphBreakChar = '\u2029'

  async init() {
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) {
      throw new Error("Directory is not a repository")
    }
  }

  public async processFile(filepath: string): Promise<void> {
    try {
      // debug(`opening filepath: ${filepath}`)
      // const buff = await readFile(filepath)
      // const initialContent = await buff.toString('utf8', 0, buff.byteLength)

      const initialContent = await this.readFileContent(filepath)

      // let paraCounter = 1
      // // \u2028 = line sep  \u200D = zero width joiner
      // const replacedContent = initialContent.replace(/([.!?…}"]) {2}([{A-ZÀ-Ú])/gm, '$1' + this.sentenceBreakChar + '\n$2')
      //   .replace(/([.!?…}"])\n{2}([{A-ZÀ-Ú])/gm, (full, one, two) => {
      //     paraCounter++
      //     // return `$1\u2029\n\n$2{{${paraCounter}}}`
      //     debug(`full: ${full} one: ${one} two: ${two}`)
      //     return `${one}\n\n${this.paragraphBreakChar}{{${paraCounter}}}\n${two}`
      //   })
      // debug(`Processed content: \n${replacedContent.substring(0, 250)}`)
      const replacedContent = this.processContent(initialContent)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

  public async processFileBack(filepath: string): Promise<void> {
    try {
      // const buff = await readFile(filepath)
      // const initialContent = await buff.toString('utf8', 0, buff.byteLength)

      const initialContent = await this.readFileContent(filepath)

      // const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\n', 'g')
      // const paragraphBreakRegex = new RegExp('\\n\\n' + this.paragraphBreakChar + '{{\\d+}}\\n', 'g')

      // debug(`sentence RE = ${sentenceBreakRegex} paragraph RE = ${paragraphBreakRegex}`)
      // const replacedContent = initialContent.replace(sentenceBreakRegex, '  ')
      //   .replace(paragraphBreakRegex, '\n\n')
      //   .replace(/([.!?…}"]) +\n/g, '$1\n')
      //   .replace(/\n*$/, '\n')
      // debug(`Processed back content: \n${replacedContent.substring(0, 250)}`)
      const replacedContent = this.processContentBack(initialContent)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

  public async readFileContent(filepath: string): Promise<string> {
    const buff = await readFile(filepath)
    const content = await buff.toString('utf8', 0, buff.byteLength)
    debug(`Reading filepath: ${filepath}\nContent:\n${content}`)
    return content
  }

  public processContent(initialContent: string): string {
    let paraCounter = 1
    // \u2028 = line sep  \u200D = zero width joiner
    const replacedContent = initialContent.replace(/([.!?…}"]) {2}([{A-ZÀ-Ú])/gm, '$1' + this.sentenceBreakChar + '\n$2')
      .replace(/([.!?…}"])\n{2}([{A-ZÀ-Ú])/gm, (full, one, two) => {
        paraCounter++
        // return `$1\u2029\n\n$2{{${paraCounter}}}`
        debug(`full: ${full} one: ${one} two: ${two}`)
        return `${one}\n\n${this.paragraphBreakChar}{{${paraCounter}}}\n${two}`
      })
    debug(`Processed content: \n${replacedContent.substring(0, 250)}`)
    return replacedContent
  }

  public processContentBack(initialContent: string): string {
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\n', 'g')
    const paragraphBreakRegex = new RegExp('\\n\\n' + this.paragraphBreakChar + '{{\\d+}}\\n', 'g')

    debug(`sentence RE = ${sentenceBreakRegex} paragraph RE = ${paragraphBreakRegex}`)
    const replacedContent = initialContent.replace(sentenceBreakRegex, '  ')
      .replace(paragraphBreakRegex, '\n\n')
      .replace(/([.!?…}"]) +\n/g, '$1\n')
      .replace(/\n*$/, '\n')
    debug(`Processed back content: \n${replacedContent.substring(0, 250)}`)
    return replacedContent
  }

  public async CommitToGit(message: string, toStageFiles: string[]) {
    let commitSummary: CommitSummary | undefined //= {author: null,branch:'', commit: '', summary: {changes: 0, }}
    try {
      cli.action.start('Saving file(s) in repository')

      debug(`Message= ${message}; toAddFiles=${JSON.stringify(toStageFiles)}`)

      await this.git.add(toStageFiles)
      await this.git.addConfig('user.name', this.configInstance.config.projectAuthor.name)
      await this.git.addConfig('user.email', this.configInstance.config.projectAuthor.email)
      debug(`name: ${this.configInstance.config.projectAuthor.name} email: ${this.configInstance.config.projectAuthor.email}`)
      commitSummary = await this.git.commit(message)
      await this.git.push()
      await this.git.pull()

    } catch (err) {
      this.error(err)
    } finally {
      cli.action.stop(`Commited and pushed\n${JSON.stringify(commitSummary, null, 2)}`)
    }
  }

  public async GetGitListOfStageableFiles(numberFilter: number | null, atFilter: boolean): Promise<string[]> {
    const gitStatus = await this.git.status()
    debug(`git status\n${JSON.stringify(gitStatus, null, 4)}`)

    const unQuote = function (value: string) {
      if (!value) { return value }
      return value.replace(/"(.*)"/, '$1')
    }

    const onlyUnique = function (value: any, index: number, self: any) {
      return self.indexOf(value) === index;
    }

    const unfilteredFileList = (await this.git.diff(['--name-only'])).split('\n')
      .concat(gitStatus.not_added.map(unQuote))
      .concat(gitStatus.deleted.map(unQuote))
      .concat(gitStatus.modified.map(unQuote))
      .concat(gitStatus.created.map(unQuote))
      .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
      .filter(onlyUnique)

    debug(`unfilteredFileList=\n${JSON.stringify(unfilteredFileList, null, 4)}`)

    return unfilteredFileList
      .filter(val => val !== '')
      .filter(val => {
        return numberFilter ?
          minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter, atFilter)) ||
          minimatch(val, this.configInstance.metadataWildcardWithNumber(numberFilter, atFilter)) ||
          minimatch(val, this.configInstance.summaryWildcardWithNumber(numberFilter, atFilter))
          : true
      })

  }


}
