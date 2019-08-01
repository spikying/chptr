import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('rename')

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
      name: 'chapterIdOrFilename',
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

    if (!args.chapterIdOrFilename) {
      //no chapter given; must ask for it
      queryBuilder.add('chapterIdOrFilename', queryBuilder.textinput('What chapter number to rename, or tracked filename?', ''))
    }

    if (!args.newName && !flags.title) {
      queryBuilder.add('newName', queryBuilder.textinput('What name to give it?', ''))
    }

    const queryResponses: any = await queryBuilder.responses()
    const chapterIdString = args.chapterIdOrFilename || queryResponses.chapterIdOrFilename || ''

    // const num = this.softConfig.extractNumber(chapterIdString)
    // const isAtNumbering = this.softConfig.isAtNumbering(chapterIdString)
    const chapterId = new ChapterId(this.softConfig.extractNumber(chapterIdString), this.softConfig.isAtNumbering(chapterIdString))

    cli.action.start('Renaming files'.actionStartColor())

    const chapterFile = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId))))[0]
    const summaryFile = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(chapterId))))[0]
    const metadataFile = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.metadataWildcardWithNumber(chapterId))))[0]

    const newName = flags.title ? await this.extractTitleFromFile(chapterFile) : args.newName || queryResponses.newName || 'chapter'
    const newNameForFile = this.fsUtils.sanitizeFileName(newName)

    if (!chapterFile || !summaryFile || !metadataFile) {
      await this.statistics.refreshStats()
      // const digits = this.statistics.getMinDigits(chapterId.isAtNumber)
      chapterId.fixedDigits = this.statistics.getMinDigits(chapterId.isAtNumber)
      const expectedFiles = [
        this.softConfig.chapterFileNameFromParameters(chapterId, newNameForFile),
        this.softConfig.summaryFileNameFromParameters(chapterId, newNameForFile),
        this.softConfig.metadataFileNameFromParameters(chapterId, newNameForFile)
      ]
      throw new ChptrError(`Missing a file within this list:${expectedFiles.map(f => `\n    ${f}`)}`, 'rename.run', 21)
    }

    // const digits = this.statistics.getActualDigitsFromChapterFilename(chapterFile, isAtNumbering)
    chapterId.fixedDigits = this.statistics.getActualDigitsFromChapterFilename(chapterFile, chapterId.isAtNumber)

    const didUpdateChapter = {
      filename: chapterFile,
      title: await this.replaceTitleInMarkdown(chapterFile, newName),
      newFileName: this.softConfig.chapterFileNameFromParameters(chapterId, newNameForFile),
      rename: ''
    }
    const didUpdateSummary = {
      filename: summaryFile,
      title: await this.replaceTitleInMarkdown(summaryFile, newName),
      newFileName: this.softConfig.summaryFileNameFromParameters(chapterId, newNameForFile),
      rename: ''
    }
    const didUpdateMetadata = {
      filename: metadataFile,
      title: await this.replaceTitleInObject(metadataFile, newName),
      newFileName: this.softConfig.metadataFileNameFromParameters(chapterId, newNameForFile),
      rename: ''
    }
    const didUpdates = [didUpdateChapter, didUpdateSummary, didUpdateMetadata]

    for (const didUpdate of didUpdates) {
      if (this.softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename) !== didUpdate.newFileName) {
        didUpdate.rename = didUpdate.newFileName
        await this.gitUtils.mv(this.softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename), didUpdate.newFileName)
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

    const toCommitFiles = await this.gitUtils.GetGitListOfStageableFiles(chapterId)
    debug(`toCommitFiles = ${JSON.stringify(toCommitFiles)}`)
    await this.coreUtils.preProcessAndCommitFiles(`Renaming chapter ${chapterIdString} to ${newName}${toRenamePretty}`, toCommitFiles)
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
    let obj: any
    try {
      obj = this.softConfig.parsePerStyle(initialContent)
      // this.softConfig.configStyle === 'JSON5'
      //   ? JSON.parse(initialContent)
      //   : this.softConfig.configStyle === 'YAML'
      //   ? yaml.safeLoad(initialContent)
      //   : {}
      const extractedMarkup = obj.extracted
      extractedMarkup.title = newTitle
    } catch (err) {
      throw new ChptrError(
        `Could not load and extract metadata from ${metadataFile}.  ${err.toString().errorColor()}`,
        'rename.replacetitleinobject',
        48
      )
    }

    const updatedContent = this.softConfig.stringifyPerStyle(obj)
    // this.softConfig.configStyle === 'JSON5'
    //   ? JSON.stringify(obj, null, 4)
    //   : this.softConfig.configStyle === 'YAML'
    //   ? yaml.safeDump(obj)
    //   : ''

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
