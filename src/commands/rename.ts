import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('command:rename')

export default class Rename extends Command {
  static description = 'Modify chapter title in text, metadata and filename or tracked filename'

  static flags = {
    ...Command.flags,
    title: flags.boolean({
      char: 't',
      description: "'Use chapter's title as new name.  Will supercede a `newName` argument.",
      default: false
    })
  }

  static args = [
    {
      name: 'chapterOrFilename',
      description: 'Chapter number or tracked filename to modify',
      required: false,
      default: ''
    },
    {
      name: 'newName',
      description: 'New chapter name',
      required: false,
      default: ''
    }
  ]

  static hidden = false

  async run() {
    debug('Running Rename command')
    const { args, flags } = this.parse(Rename)

    const queryBuilder = new QueryBuilder()

    if (!args.chapterOrFilename) {
      //no chapter given; must ask for it
      queryBuilder.add('chapterOrFilename', queryBuilder.textinput('What chapter number to rename, or tracked filename?', ''))
    }

    if (!args.newName && !flags.title) {
      queryBuilder.add('newName', queryBuilder.textinput('What name to give it?', ''))
    }

    const queryResponses: any = await queryBuilder.responses()
    const chapterId = args.chapterOrFilename || queryResponses.chapterOrFilename || ''

    const num = this.softConfig.extractNumber(chapterId)
    const isAtNumbering = this.softConfig.isAtNumbering(chapterId)

    cli.action.start('Renaming files'.actionStartColor())

    const chapterFile = (await this.fsUtils.globPromise(
      path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(num, isAtNumbering))
    ))[0]
    const summaryFile = (await this.fsUtils.globPromise(
      path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(num, isAtNumbering))
    ))[0]
    const metadataFile = (await this.fsUtils.globPromise(
      path.join(this.rootPath, this.softConfig.metadataWildcardWithNumber(num, isAtNumbering))
    ))[0]

    const newName = flags.title ? await this.extractTitleFromFile(chapterFile) : args.newName || queryResponses.newName || 'chapter'
    const newNameForFile = this.fsUtils.sanitizeFileName(newName)

    if (!chapterFile || !summaryFile || !metadataFile) {
      await this.statistics.updateStackStatistics(isAtNumbering)
      const digits = this.statistics.getMinDigits(isAtNumbering)
      const expectedFiles = [
        this.softConfig.chapterFileNameFromParameters(this.fsUtils.stringifyNumber(num, digits), newNameForFile, isAtNumbering),
        this.softConfig.summaryFileNameFromParameters(this.fsUtils.stringifyNumber(num, digits), newNameForFile, isAtNumbering),
        this.softConfig.metadataFileNameFromParameters(this.fsUtils.stringifyNumber(num, digits), newNameForFile, isAtNumbering)
      ]
      throw new ChptrError(`Missing a file within this list:${expectedFiles.map(f => `\n    ${f}`)}`, 'rename.run', 21)
    }

    const digits = this.statistics.getActualDigitsFromChapterFilename(chapterFile, isAtNumbering)

    const didUpdateChapter = {
      filename: chapterFile,
      title: await this.replaceTitleInMarkdown(chapterFile, newName),
      newFileName: this.softConfig.chapterFileNameFromParameters(this.fsUtils.stringifyNumber(num, digits), newNameForFile, isAtNumbering),
      rename: ''
    }
    const didUpdateSummary = {
      filename: summaryFile,
      title: await this.replaceTitleInMarkdown(summaryFile, newName),
      newFileName: this.softConfig.summaryFileNameFromParameters(this.fsUtils.stringifyNumber(num, digits), newNameForFile, isAtNumbering),
      rename: ''
    }
    const didUpdateMetadata = {
      filename: metadataFile,
      title: await this.replaceTitleInObject(metadataFile, newName),
      newFileName: this.softConfig.metadataFileNameFromParameters(this.fsUtils.stringifyNumber(num, digits), newNameForFile, isAtNumbering),
      rename: ''
    }
    const didUpdates = [didUpdateChapter, didUpdateSummary, didUpdateMetadata]

    for (const didUpdate of didUpdates) {
      if (this.softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename) !== didUpdate.newFileName) {
        didUpdate.rename = didUpdate.newFileName
        await this.git.mv(this.softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename), didUpdate.newFileName)
      }
    }

    const toRenamePretty = didUpdates.reduce(
      (previous, current) =>
        `${previous}\n    ${current.filename} (${current.title ? 'updated content' : 'content not updated'}; ${
          current.rename ? 'renamed to ' + current.rename : 'not renamed'
        })`,
      ''
    )
    cli.action.stop(toRenamePretty.actionStopColor())

    const toCommitFiles = await this.GetGitListOfStageableFiles(num, isAtNumbering)
    debug(`toCommitFiles = ${JSON.stringify(toCommitFiles)}`)
    await this.CommitToGit(`Renaming chapter ${chapterId} to ${newName}${toRenamePretty}`, toCommitFiles)
  }

  private async replaceTitleInMarkdown(actualFile: string, newTitle: string): Promise<boolean> {
    const initialContent = await this.fsUtils.readFileContent(actualFile)
    const replacedContent = initialContent.replace(this.markupUtils.titleRegex, `\n# ${newTitle}\n`)
    if (initialContent !== replacedContent) {
      await this.fsUtils.writeFile(actualFile, replacedContent)
      return true
    }
    return false
  }

  private async replaceTitleInObject(metadataFile: string, newTitle: string): Promise<boolean> {
    const initialContent = await this.fsUtils.readFileContent(metadataFile)
    const obj = JSON.parse(initialContent)
    const extractedMarkup = obj.extracted

    extractedMarkup.title = newTitle

    const updatedContent = JSON.stringify(obj, null, 4)

    if (initialContent !== updatedContent) {
      await this.fsUtils.writeFile(metadataFile, updatedContent)
      return true
    } else {
      return false
    }
  }

  private async extractTitleFromFile(chapterFile: string): Promise<string | null> {
    const initialContent = await this.fsUtils.readFileContent(path.join(this.rootPath, chapterFile))
    return this.markupUtils.extractTitleFromString(initialContent)
  }
}
