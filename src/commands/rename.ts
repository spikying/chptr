import { Args, Flags, ux } from '@oclif/core'
import { glob } from 'glob'
import * as path from 'node:path'

import { ChapterId } from '../shared/chapter-id'
import { ChptrError } from '../shared/chptr-error'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'
import { FsUtils } from '../shared/fs-utils'
import { Container } from 'typescript-ioc'
import { SoftConfig } from '../shared/soft-config'
import { MarkupUtils } from '../shared/markup-utils'
import { Statistics } from '../shared/statistics'
import { GitUtils } from '../shared/git-utils'
import { CoreUtils } from '../shared/core-utils'
import { actionStartColor, actionStopColor } from '../shared/colorize'
// import Command from './initialized-base'

const debug = d('rename')

export default class Rename extends BaseCommand<typeof Rename> {
  static args = {
    chapterIdOrFilename: Args.string({
      default: '',
      description: 'Chapter number or tracked filename to modify',
      name: 'chapterIdOrFilename',
      required: false
    }),
    newName: Args.string({
      default: '',
      description: 'New chapter name',
      name: 'newName',
      required: false
    })
  }

  static description = 'Modify chapter title in text, metadata and filename or tracked filename'

  static flags = {
    all: Flags.boolean({
      char: 'a',
      default: false,
      dependsOn: ['title'],
      description: 'Will run on every chapter file.  Will ignore a `chapterIdOrFilename argument.`'
    }),
    save: Flags.boolean({
      char: 's',
      default: false,
      description: 'Commit to git at the same time.'
    }),
    title: Flags.boolean({
      char: 't',
      default: false,
      description: "Use chapter's title as new name.  Will supercede a `newName` argument."
    })
  }

  static hidden = false

  private fsUtils: FsUtils = Container.get(FsUtils)
  private rootPath = Container.getValue('rootPath')
  private softConfig = Container.get(SoftConfig)
  private markupUtils = Container.get(MarkupUtils)
  private statistics = Container.get(Statistics)
  private gitUtils = Container.get(GitUtils)
  private coreUtils = Container.get(CoreUtils)

  async run() {
    debug('Running Rename command')
    const { args, flags } = await this.parse(Rename)

    const queryBuilder = new QueryBuilder()

    const allFlag = flags.all

    if (!args.chapterIdOrFilename && !allFlag) {
      // no chapter given; must ask for it
      queryBuilder.add('chapterIdOrFilename', queryBuilder.textinput('What chapter number to rename, or tracked filename?', ''))
    }

    if (!args.newName && !flags.title) {
      queryBuilder.add('newName', queryBuilder.textinput('What name to give it?', ''))
    }

    const queryResponses: any = await queryBuilder.responses()

    const chapterIdString = args.chapterIdOrFilename || queryResponses.chapterIdOrFilename || ''

    const chapterIds: ChapterId[] = []
    if (allFlag) {
      const allChapterFiles = await this.softConfig.getAllChapterFiles()
      for (const file of allChapterFiles) {
        const num = this.softConfig.extractNumber(file)
        const chapterId = new ChapterId(num, this.softConfig.isAtNumbering(file))
        chapterIds.push(chapterId)
      }
    } else {
      const num = this.softConfig.extractNumber(chapterIdString)
      const chapterId = new ChapterId(num, this.softConfig.isAtNumbering(chapterIdString))
      chapterIds.push(chapterId)
    }

    for (const chapterId of chapterIds) {
      ux.action.start(actionStartColor(`Renaming files for chapter ${chapterId.toString()}`))

      const [chapterFile] = await glob(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId)))
      const [summaryFile] = await glob(path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(chapterId)))
      const [metadataFile] = await glob(path.join(this.rootPath, this.softConfig.metadataWildcardWithNumber(chapterId)))

      debug(`tracked Files: ${JSON.stringify(await glob(path.join(this.rootPath, 'readme.md')))}`)
      let [trackedFile] = await glob(path.join(this.rootPath, chapterIdString))
      if (trackedFile == '.') {
        trackedFile = ''
      }

      debug(`chapter wildcard = ${this.softConfig.chapterWildcardWithNumber(chapterId)}`)
      debug(`chapter file = ${chapterFile}`)
      const newName = flags.title ? await this.extractTitleFromFile(chapterFile) : args.newName || queryResponses.newName || 'chapter'
      const newNameForFile = this.fsUtils.sanitizeFileName(newName, true).replace(path.sep, '/')
      debug(`new name = ${newName}\n  newnameforfile: ${newNameForFile}`)
      debug(`trackedFile: ${trackedFile}`)

      let didUpdates: {
        filename: string
        newFileName: string
        rename: string
        title: boolean
      }[]

      if (trackedFile) {
        // const tfExt = path.extname(trackedFile)
        didUpdates = [
          {
            filename: trackedFile,
            newFileName: `${newNameForFile}`, // ${tfExt}`,
            rename: '',
            title: false
          }
        ]
      } else {
        if (!chapterFile || !summaryFile || !metadataFile) {
          debug('ping')
          await this.statistics.refreshStats()
          chapterId.fixedDigits = this.statistics.getMinDigits(chapterId.isAtNumber)
          const expectedFiles = [
            this.softConfig.chapterFileNameFromParameters(chapterId, newNameForFile),
            this.softConfig.summaryFileNameFromParameters(chapterId, newNameForFile),
            this.softConfig.metadataFileNameFromParameters(chapterId, newNameForFile),
            `${chapterIdString}.*`
          ]
          throw new ChptrError(`Missing a file within this list:${expectedFiles.map(f => `\n    ${f}`)}`, 'rename.run', 21)
        }

        debug(`chapterFile: ${chapterFile}`)

        // const digits = this.statistics.getActualDigitsFromChapterFilename(chapterFile, isAtNumbering)
        chapterId.fixedDigits = this.statistics.getActualDigitsFromChapterFilename(chapterFile, chapterId.isAtNumber)

        const didUpdateChapter = {
          filename: chapterFile,
          newFileName: this.softConfig.chapterFileNameFromParameters(chapterId, newNameForFile),
          rename: '',
          title: await this.replaceTitleInMarkdown(chapterFile, newName)
        }
        const didUpdateSummary = {
          filename: summaryFile,
          newFileName: this.softConfig.summaryFileNameFromParameters(chapterId, newNameForFile),
          rename: '',
          title: await this.replaceTitleInMarkdown(summaryFile, newName)
        }
        const didUpdateMetadata = {
          filename: metadataFile,
          newFileName: this.softConfig.metadataFileNameFromParameters(chapterId, newNameForFile),
          rename: '',
          title: await this.replaceTitleInObject(metadataFile, newName)
        }
        didUpdates = [didUpdateChapter, didUpdateSummary, didUpdateMetadata]
        debug(`didUpdates: ${JSON.stringify(didUpdates)}`)
      }

      for (const didUpdate of didUpdates) {
        debug(`didUpdate: ${JSON.stringify(didUpdate)}`)
        if (this.softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename) !== didUpdate.newFileName) {
          didUpdate.rename = didUpdate.newFileName
          await this.gitUtils.mv(this.softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename), didUpdate.newFileName)
        }

        debug('pong')
      }

      const toRenamePretty = didUpdates.reduce(
        (previous, current) =>
          `${previous}\n    ${current.filename} (${current.title ? 'updated content' : 'content not updated'}; ${
            current.rename ? 'renamed to ' + current.rename : 'not renamed'
          })`,
        ''
      )
      ux.action.stop(actionStopColor(toRenamePretty))

      if (flags.save) {
        const toCommitFiles = await this.gitUtils.GetGitListOfStageableFiles(chapterId)
        debug(`toCommitFiles = ${JSON.stringify(toCommitFiles)}`)
        await this.coreUtils.preProcessAndCommitFiles(`Renaming chapter ${chapterIdString} to ${newName}${toRenamePretty}`, toCommitFiles)
      }
    }
  }

  private async extractTitleFromFile(chapterFile: string): Promise<null | string> {
    const initialContent = await this.fsUtils.readFileContent(path.join(this.rootPath, chapterFile))
    return this.markupUtils.extractTitleFromString(initialContent)
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
      // const extractedMarkup = obj.extracted
      // delete extractedMarkup.title
      obj.computed.title = newTitle
      obj.summary.title = newTitle
      // extractedMarkup.title = newTitle
    } catch (error: any) {
      throw new ChptrError(
        `Could not load and extract metadata from ${metadataFile}.  ${error.toString().errorColor()}`,
        'rename.replacetitleinobject',
        48
      )
    }

    const updatedContent = this.softConfig.stringifyPerStyle(obj)

    if (initialContent !== updatedContent) {
      await this.fsUtils.writeFile(metadataFile, updatedContent)
      return true
    }

    return false
  }
}
