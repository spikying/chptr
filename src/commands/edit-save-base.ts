import { cli } from 'cli-ux'
import * as minimatch from 'minimatch'
import * as path from 'path'

import Command, { d, fileExists, readFile, writeFile } from './base'

const debug = d('command:edit-save-base')

export default abstract class extends Command {
  static flags = {
    ...Command.flags
  }

  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u000D'// '\u200D' // '\u2028'
  public readonly paragraphBreakChar = '\u2029'

  async init() {
    await super.init()
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) {
      throw new Error('Directory is not a repository')
    }
  }

  public async processFile(filepath: string): Promise<void> {
    try {
      const initialContent = await this.readFileContent(filepath)

      const replacedContent = this.processContent(initialContent)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }
  }

  public async processFileBack(filepath: string): Promise<void> {
    try {
      const initialContent = await this.readFileContent(filepath)

      const replacedContent = this.processContentBack(initialContent)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (err) {
      this.error(err.toString().errorColor())
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
    const replacedContent = initialContent
      .replace(/([.!?…}"]) {2}([{A-ZÀ-Ú])/gm, '$1' + this.sentenceBreakChar + '\n$2')
      .replace(/([.!?…}"])\n{2}([{A-ZÀ-Ú])/gm, (_full, one, two) => {
        paraCounter++
        return `${one}\n\n${this.paragraphBreakChar}{{${paraCounter}}}\n${two}`
      })
    debug(`Processed content: \n${replacedContent.substring(0, 250)}`)
    return replacedContent
  }

  public processContentBack(initialContent: string): string {
    const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\n', 'g')
    const paragraphBreakRegex = new RegExp('\\n\\n' + this.paragraphBreakChar + '{{\\d+}}\\n', 'g')

    const replacedContent = initialContent
      .replace(sentenceBreakRegex, '  ')
      .replace(paragraphBreakRegex, '\n\n')
      .replace(/([.!?…}"]) +\n/g, '$1\n')
      .replace(/\n*$/, '\n')
    debug(`Processed back content: \n${replacedContent.substring(0, 250)}`)
    return replacedContent
  }

  public async CommitToGit(message: string, toStageFiles?: string[]) {
    toStageFiles = toStageFiles || (await this.GetGitListOfStageableFiles())
    if (toStageFiles.length > 0) {
      try {
        cli.action.start('Saving file(s) in repository'.actionStartColor())

        await this.processChapterFilesBeforeSaving(toStageFiles)

        await this.git.add(toStageFiles)
        await this.git.addConfig('user.name', this.configInstance.config.projectAuthor.name)
        await this.git.addConfig('user.email', this.configInstance.config.projectAuthor.email)

        const commitSummary = await this.git.commit(message)
        await this.git.push()
        await this.git.pull()

        debug(`commitSummary:\n${JSON.stringify(commitSummary)}`)
        const toStagePretty = toStageFiles.map(f => `\n    ${f}`.infoColor())
        cli.action.stop(
          `\nCommited and pushed ${commitSummary.commit.resultHighlighColor()}:\n${message.infoColor()}\nFile${toStageFiles.length > 1 ? 's' : ''}:${toStagePretty}`.actionStopColor()
        )
      } catch (err) {
        this.error(err.toString().errorColor())
      }
    }
  }

  public async GetGitListOfStageableFiles(numberFilter?: number, atFilter?: boolean): Promise<string[]> {
    const gitStatus = await this.git.status()
    debug(`git status\n${JSON.stringify(gitStatus, null, 4)}`)

    const unQuote = function(value: string) {
      if (!value) {
        return value
      }
      return value.replace(/"(.*)"/, '$1')
    }

    const onlyUnique = function(value: any, index: number, self: any) {
      return self.indexOf(value) === index
    }

    const unfilteredFileList = (await this.git.diff(['--name-only']))
      .split('\n')
      .concat(gitStatus.not_added.map(unQuote))
      .concat(gitStatus.deleted.map(unQuote))
      .concat(gitStatus.modified.map(unQuote))
      .concat(gitStatus.created.map(unQuote))
      .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
      .filter(onlyUnique)

    return unfilteredFileList
      .filter(val => val !== '')
      .filter(val => {
        return numberFilter
          ? minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.configInstance.metadataWildcardWithNumber(numberFilter, atFilter || false)) ||
              minimatch(val, this.configInstance.summaryWildcardWithNumber(numberFilter, atFilter || false))
          : true
      })
  }

  public async processChapterFilesBeforeSaving(toStageFiles: string[]): Promise<void> {
    // cli.action.start('Reading and processing modified files')
    for (const filename of toStageFiles) {
      const fullPath = path.join(this.configInstance.projectRootPath, filename)
      const exists = await fileExists(fullPath)
      if (
        exists &&
        (this.configInstance.chapterRegex(false).test(path.basename(fullPath)) || this.configInstance.chapterRegex(true).test(path.basename(fullPath)))
      ) {
        await this.processFileBack(fullPath)
        await this.processFile(fullPath)
      }
    }
    // cli.action.stop(`done ${toStageFiles.join(' ')}`)
  }
}
