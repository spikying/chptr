import { cli } from 'cli-ux'
import * as path from 'path'

import { QueryBuilder } from '../queries'

import { d, globPromise, sanitizeFileName, stringifyNumber, writeFile } from './base'
import Command from './edit-save-base'

const debug = d('command:rename')

export default class Rename extends Command {
  static description = 'Modify chapter title in text, metadata and filename'

  static flags = {
    ...Command.flags
  }

  static args = [
    {
      name: 'chapter',
      description: 'Chapter number to modify',
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
    const { args } = this.parse(Rename)

    const queryBuilder = new QueryBuilder()

    if (!args.chapter) {
      //no chapter given; must ask for it
      queryBuilder.add('chapter', queryBuilder.textinput('What chapter to rename?', ''))
    }

    if (!args.newName) {
      queryBuilder.add('newName', queryBuilder.textinput('What name to give it?', ''))
    }

    const queryResponses: any = await queryBuilder.responses()
    const chapterId = args.chapter || queryResponses.chapter || ''
    const newName = args.newName || queryResponses.newName || 'chapter'
    const newNameForFile = sanitizeFileName(newName)

    const num = this.context.extractNumber(chapterId)
    const isAtNumbering = this.configInstance.isAtNumbering(chapterId)

    cli.action.start('Renaming files'.actionStartColor())

    const chapterFile = (await globPromise(
      path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber(num, isAtNumbering))
    ))[0]
    const summaryFile = (await globPromise(
      path.join(this.configInstance.projectRootPath, this.configInstance.summaryWildcardWithNumber(num, isAtNumbering))
    ))[0]
    const metadataFile = (await globPromise(
      path.join(this.configInstance.projectRootPath, this.configInstance.metadataWildcardWithNumber(num, isAtNumbering))
    ))[0]

    if (!chapterFile || !summaryFile || !metadataFile) {
      await this.context.updateStackStatistics(isAtNumbering)
      const digits = this.context.getMinDigits(isAtNumbering)
      const expectedFiles = [
        this.configInstance.chapterFileNameFromParameters(stringifyNumber(num, digits), newNameForFile, isAtNumbering),
        this.configInstance.summaryFileNameFromParameters(stringifyNumber(num, digits), newNameForFile, isAtNumbering),
        this.configInstance.metadataFileNameFromParameters(stringifyNumber(num, digits), newNameForFile, isAtNumbering)
      ]
      this.error(`Missing a file within this list:${expectedFiles.map(f => `\n    ${f}`)}`.errorColor())
      this.exit(0)
    }

    const digits = this.context.getActualDigitsFromChapterFilename(chapterFile, isAtNumbering)

    const didUpdateChapter = { filename: chapterFile, title: await this.replaceTitleInMarkdown(chapterFile, newName), rename: '' }
    const didUpdateSummary = { filename: summaryFile, title: await this.replaceTitleInMarkdown(summaryFile, newName), rename: '' }
    const didUpdateMetadata = { filename: metadataFile, title: false, rename: '' }

    const initialContent = await this.readFileContent(metadataFile)
    const obj = JSON.parse(initialContent)
    const extractedMarkup = obj.extracted

    extractedMarkup.title = newName

    // await this.overwriteMetadata(metadataFile, extractedMarkup, computedMarkup)
    const updatedContent = JSON.stringify(obj, null, 4)
    debug(`initialCntent=${JSON.stringify(initialContent)} updatedContent=${updatedContent}`)
    if (initialContent !== updatedContent) {
      await writeFile(metadataFile, updatedContent)
      didUpdateMetadata.title = true
    }

    const newChapterFilename = this.configInstance.chapterFileNameFromParameters(stringifyNumber(num, digits), newNameForFile, isAtNumbering)
    const newSummaryFilename = this.configInstance.summaryFileNameFromParameters(stringifyNumber(num, digits), newNameForFile, isAtNumbering)
    const newMetadataFilename = this.configInstance.metadataFileNameFromParameters(stringifyNumber(num, digits), newNameForFile, isAtNumbering)

    if (this.context.mapFileToBeRelativeToRootPath(chapterFile) !== newChapterFilename) {
      didUpdateChapter.rename = newChapterFilename
      await this.git.mv(this.context.mapFileToBeRelativeToRootPath(chapterFile), newChapterFilename)
    }
    if (this.context.mapFileToBeRelativeToRootPath(summaryFile) !== newSummaryFilename) {
      didUpdateSummary.rename = newSummaryFilename
      await this.git.mv(this.context.mapFileToBeRelativeToRootPath(summaryFile), newSummaryFilename)
    }
    if (this.context.mapFileToBeRelativeToRootPath(metadataFile) !== newMetadataFilename) {
      didUpdateMetadata.rename = newMetadataFilename
      await this.git.mv(this.context.mapFileToBeRelativeToRootPath(metadataFile), newMetadataFilename)
    }

    const toRenamePretty = [didUpdateChapter, didUpdateSummary, didUpdateMetadata].reduce(
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

  private async replaceTitleInMarkdown(actualFile: string, newName: string): Promise<boolean> {
    const titleRegex = /^\n# (.*?)\n/
    const initialContent = await this.readFileContent(actualFile)
    const replacedContent = initialContent.replace(titleRegex, `\n# ${newName}\n`)
    if (initialContent !== replacedContent) {
      await writeFile(actualFile, replacedContent, 'utf8')
      return true
    }
    return false
  }
}
