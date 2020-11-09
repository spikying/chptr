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
      description: "Use chapter's title as new name.  Will supercede a `newName` argument.",
      default: false
    }),
    all: flags.boolean({
      char: 'a',
      description: 'Will run on every chapter file.  Will ignore a `chapterIdOrFilename argument.`',
      dependsOn: ['title'],
      default: false
    }),
    save: flags.boolean({
      char: 's',
      description: 'Commit to git at the same time.',
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

    const allFlag = flags.all

    if (!args.chapterIdOrFilename && !allFlag) {
      //no chapter given; must ask for it
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
      cli.action.start(`Renaming files for chapter ${chapterId.toString()}`.actionStartColor())

      const chapterFile = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId))))[0]
      const summaryFile = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.summaryWildcardWithNumber(chapterId))))[0]
      const metadataFile = (
        await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.metadataWildcardWithNumber(chapterId)))
      )[0]
      debug(`tracked Files: ${JSON.stringify(await this.fsUtils.listFiles(path.join(this.rootPath, 'readme.md')))}`)
      var trackedFile = (await this.fsUtils.listFiles(path.join(this.rootPath, chapterIdString)))[0]
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
        title: boolean
        newFileName: string
        rename: string
      }[]

      if (trackedFile) {
        // const tfExt = path.extname(trackedFile)
        didUpdates = [
          {
            filename: trackedFile,
            title: false,
            newFileName: `${newNameForFile}`, //${tfExt}`,
            rename: ''
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
      cli.action.stop(toRenamePretty.actionStopColor())

      if (flags.save) {
        const toCommitFiles = await this.gitUtils.GetGitListOfStageableFiles(chapterId)
        debug(`toCommitFiles = ${JSON.stringify(toCommitFiles)}`)
        await this.coreUtils.preProcessAndCommitFiles(`Renaming chapter ${chapterIdString} to ${newName}${toRenamePretty}`, toCommitFiles)
      }
    }
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
    } catch (err) {
      throw new ChptrError(
        `Could not load and extract metadata from ${metadataFile}.  ${err.toString().errorColor()}`,
        'rename.replacetitleinobject',
        48
      )
    }

    const updatedContent = this.softConfig.stringifyPerStyle(obj)

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
