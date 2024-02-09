import { Args, Flags, ux } from '@oclif/core'
import { glob } from 'glob'
import * as path from 'node:path'
import { Container } from 'typescript-ioc'
import { ChapterId } from '../shared/chapter-id'
import { ChptrError } from '../shared/chptr-error'
import { actionStartColor, actionStopColor, errorColor } from '../shared/colorize'
import { CoreUtils } from '../shared/core-utils'
import { FsUtils } from '../shared/fs-utils'
import { GitUtils } from '../shared/git-utils'
import { MarkupUtils } from '../shared/markup-utils'
import { SoftConfig } from '../shared/soft-config'
import { Statistics } from '../shared/statistics'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'

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

  async run() {
    debug('Running Rename command')

    const rootPath = Container.getValue('rootPath')
    const softConfig = Container.get(SoftConfig)
    const markupUtils = Container.get(MarkupUtils)
    const statistics = Container.get(Statistics)
    const gitUtils = Container.get(GitUtils)
    const coreUtils = Container.get(CoreUtils)
    // const { args, flags } = await this.parse(Rename)

    const queryBuilder = new QueryBuilder()

    const allFlag = this.flags.all

    if (!this.args.chapterIdOrFilename && !allFlag) {
      // no chapter given; must ask for it
      queryBuilder.add('chapterIdOrFilename', queryBuilder.textinput('What chapter number to rename, or tracked filename?', ''))
    }

    if (!this.args.newName && !this.flags.title) {
      queryBuilder.add('newName', queryBuilder.textinput('What name to give it?', ''))
    }

    const queryResponses: any = await queryBuilder.responses()

    const chapterIdString = this.args.chapterIdOrFilename || queryResponses.chapterIdOrFilename || ''

    const chapterIds: ChapterId[] = []
    if (allFlag) {
      const allChapterFiles = await softConfig.getAllChapterFiles()
      for (const file of allChapterFiles) {
        const num = softConfig.extractNumber(file)
        const chapterId = new ChapterId(num, softConfig.isAtNumbering(file))
        chapterIds.push(chapterId)
      }
    } else {
      const num = softConfig.extractNumber(chapterIdString)
      const chapterId = new ChapterId(num, softConfig.isAtNumbering(chapterIdString))
      chapterIds.push(chapterId)
    }

    for (const chapterId of chapterIds) {
      ux.action.start(actionStartColor(`Renaming files for chapter ${chapterId.toString()}`))

      const [chapterFile] = await glob(path.join(rootPath, softConfig.chapterWildcardWithNumber(chapterId)))
      const [summaryFile] = await glob(path.join(rootPath, softConfig.summaryWildcardWithNumber(chapterId)))
      const [metadataFile] = await glob(path.join(rootPath, softConfig.metadataWildcardWithNumber(chapterId)))

      debug(`tracked Files: ${JSON.stringify(await glob(path.join(rootPath, 'readme.md')))}`)
      let [trackedFile] = await glob(path.join(rootPath, chapterIdString))
      if (trackedFile == '.') {
        trackedFile = ''
      }

      debug(`chapter wildcard = ${softConfig.chapterWildcardWithNumber(chapterId)}`)
      debug(`chapter file = ${chapterFile}`)
      const newName = this.flags.title
        ? await this.extractTitleFromFile(chapterFile, rootPath, markupUtils)
        : this.args.newName || queryResponses.newName || 'chapter'
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
          await statistics.refreshStats()
          chapterId.fixedDigits = statistics.getMinDigits(chapterId.isAtNumber)
          const expectedFiles = [
            softConfig.chapterFileNameFromParameters(chapterId, newNameForFile),
            softConfig.summaryFileNameFromParameters(chapterId, newNameForFile),
            softConfig.metadataFileNameFromParameters(chapterId, newNameForFile),
            `${chapterIdString}.*`
          ]
          throw new ChptrError(`Missing a file within this list:${expectedFiles.map(f => `\n    ${f}`)}`, 'rename.run', 21)
        }

        debug(`chapterFile: ${chapterFile}`)

        // const digits = statistics.getActualDigitsFromChapterFilename(chapterFile, isAtNumbering)
        chapterId.fixedDigits = statistics.getActualDigitsFromChapterFilename(chapterFile, chapterId.isAtNumber)

        const didUpdateChapter = {
          filename: chapterFile,
          newFileName: softConfig.chapterFileNameFromParameters(chapterId, newNameForFile),
          rename: '',
          title: await this.replaceTitleInMarkdown(chapterFile, newName, markupUtils)
        }
        const didUpdateSummary = {
          filename: summaryFile,
          newFileName: softConfig.summaryFileNameFromParameters(chapterId, newNameForFile),
          rename: '',
          title: await this.replaceTitleInMarkdown(summaryFile, newName, markupUtils)
        }
        const didUpdateMetadata = {
          filename: metadataFile,
          newFileName: softConfig.metadataFileNameFromParameters(chapterId, newNameForFile),
          rename: '',
          title: await this.replaceTitleInObject(metadataFile, newName, softConfig)
        }
        didUpdates = [didUpdateChapter, didUpdateSummary, didUpdateMetadata]
        debug(`didUpdates: ${JSON.stringify(didUpdates)}`)
      }

      for (const didUpdate of didUpdates) {
        debug(`didUpdate: ${JSON.stringify(didUpdate)}`)
        if (softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename) !== didUpdate.newFileName) {
          didUpdate.rename = didUpdate.newFileName
          await gitUtils.mv(softConfig.mapFileToBeRelativeToRootPath(didUpdate.filename), didUpdate.newFileName)
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

      if (this.flags.save) {
        const toCommitFiles = await gitUtils.GetGitListOfStageableFiles(chapterId)
        debug(`toCommitFiles = ${JSON.stringify(toCommitFiles)}`)
        await coreUtils.preProcessAndCommitFiles(`Renaming chapter ${chapterIdString} to ${newName}${toRenamePretty}`, toCommitFiles)
      }
    }
  }

  private async extractTitleFromFile(chapterFile: string, rootPath: string, markupUtils: MarkupUtils): Promise<null | string> {
    const initialContent = await this.fsUtils.readFileContent(path.join(rootPath, chapterFile))
    return markupUtils.extractTitleFromString(initialContent)
  }

  private async replaceTitleInMarkdown(actualFile: string, newTitle: string, markupUtils: MarkupUtils): Promise<boolean> {
    const initialContent = await this.fsUtils.readFileContent(actualFile)
    const replacedContent = initialContent.replace(markupUtils.titleRegex, `\n# ${newTitle}\n`)
    if (initialContent !== replacedContent) {
      await this.fsUtils.writeFile(actualFile, replacedContent)
      return true
    }

    return false
  }

  private async replaceTitleInObject(metadataFile: string, newTitle: string, softConfig: SoftConfig): Promise<boolean> {
    const initialContent = await this.fsUtils.readFileContent(metadataFile)
    let obj: any
    try {
      obj = softConfig.parsePerStyle(initialContent)
      // const extractedMarkup = obj.extracted
      // delete extractedMarkup.title
      obj.computed.title = newTitle
      obj.summary.title = newTitle
      // extractedMarkup.title = newTitle
    } catch (error: any) {
      throw new ChptrError(
        `Could not load and extract metadata from ${metadataFile}.  ${errorColor(error.toString())}`,
        'rename.replacetitleinobject',
        48
      )
    }

    const updatedContent = softConfig.stringifyPerStyle(obj)

    if (initialContent !== updatedContent) {
      await this.fsUtils.writeFile(metadataFile, updatedContent)
      return true
    }

    return false
  }
}
