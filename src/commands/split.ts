import { Args, Flags, ux } from '@oclif/core'
import { glob } from 'glob'
import * as minimatch from 'minimatch'
import * as path from 'node:path'
import { Container } from 'typescript-ioc'
import { compact } from '../flags/compact-flag'
import { ChptrError } from '../shared/chptr-error'
import { resultHighlighColor, resultNormalColor } from '../shared/colorize'
import { CoreUtils } from '../shared/core-utils'
import { FsUtils } from '../shared/fs-utils'
import { MarkupUtils } from '../shared/markup-utils'
import { SoftConfig } from '../shared/soft-config'
import { Statistics } from '../shared/statistics'
import BaseCommand, { d } from './base'
// import Command from './compactable-base'

const debug = d('split')

export default class Split extends BaseCommand<typeof Split> {
  static aliases = ['divide']

  static args = { origin: Args.string({ description: 'Chapter number to split', name: 'origin', required: false }) }

  static description = 'Outputs a chapter file for each `# Title level 1` in an original chapter.'

  static flags = {
    compact: compact,
    // compact: Flags.boolean({
    //   char: 'c',
    //   default: false,
    //   description: 'Compact chapter numbers at the same time'
    // }),
    type: Flags.string({
      char: 't',
      default: 'chapter',
      description: 'Parse either chapter file or summary file.  The other file will be untouched.',
      options: ['summary', 'chapter'],
      required: true
    })
  }

  async run() {
    debug('In Split command')
    const { args, flags } = await this.parse(Split)
    const { type } = flags
    const { compact } = flags

    const coreUtils = Container.get(CoreUtils)
    const softConfig = Container.get(SoftConfig)
    const rootPath = Container.getValue('rootPath')
    const fsUtils = Container.get(FsUtils)
    const statistics = Container.get(Statistics)
    const markupUtils = Container.get(MarkupUtils)

    debug(`args: ${JSON.stringify(args)}`)
    const chapterId = await coreUtils.checkArgPromptAndExtractChapterId(args.origin || '', 'What chapter to split?')
    if (!chapterId) {
      throw new ChptrError('No chapter found with id given', 'split.run', 45)
    }

    debug(`chapterId = ${chapterId.toString()}`)

    let commitMsg = `Split ${type} ${chapterId.toString()} `
    const commitFiles: string[] = []

    const toAnalyseFiles = await glob(
      path.join(
        rootPath,
        type === 'chapter'
          ? softConfig.chapterWildcardWithNumber(chapterId)
          : type === 'summary'
            ? softConfig.summaryWildcardWithNumber(chapterId)
            : ''
      )
    )
    const toAnalyseFile = toAnalyseFiles && toAnalyseFiles.length === 1 ? toAnalyseFiles[0] : null
    if (toAnalyseFile) {
      commitFiles.push(toAnalyseFile)
    } else {
      throw new ChptrError('There should be one and only one file fitting this pattern.', 'split.run', 16)
    }

    const toEditPretty = `\n    analyzing from file ${softConfig.mapFileToBeRelativeToRootPath(toAnalyseFile)}`
    const initialContent = await fsUtils.readFileContent(toAnalyseFile)
    const replacedContents = await this.splitContentByTitles(initialContent)

    if (replacedContents.length > 1) {
      ux.info(resultNormalColor('Reading and processing chapter...'))

      await statistics.refreshStats()

      ux.info(resultNormalColor('Adding new chapters...'))
      commitMsg += `in ${replacedContents.length} parts:`

      // TODO: first chapter keeps its files and name, and all others are put in @end queue

      // not looping in first segment
      for (let i = 1; i < replacedContents.length; i++) {
        const titleAndContentPair = replacedContents[i]
        const title = markupUtils.extractTitleFromString(titleAndContentPair[0]) || 'chapter'
        commitMsg += `\n    ${title}`

        debug(`titleAndContentPair=${JSON.stringify(titleAndContentPair)}`)
        // await cli.anykey()

        await statistics.refreshStats()

        const newContent = coreUtils.processContent(titleAndContentPair.join(''))
        debug(`newContent:\n${newContent}`)

        const addedFiles = await coreUtils.addChapterFiles(title, true, undefined, newContent)
        // await this.gitUtils.add(addedFiles)
        commitFiles.push(...addedFiles)
        ux.info(`Added\n    ${addedFiles.join('\n    ')}`)

        addedFiles.forEach(async file => {
          if (minimatch(file, softConfig.chapterWildcard(true))) {
            await markupUtils.UpdateSingleMetadata(file)
            // addedTempIds.push(new ChapterId(this.softConfig.extractNumber(file), true))
          }
        })
      }

      await fsUtils.writeFile(toAnalyseFile, coreUtils.processContent(replacedContents[0].join('')))

      commitMsg = commitMsg.replace(/, $/, '')

      ux.info(resultNormalColor(`modified files:${resultHighlighColor(toEditPretty)}`))

      if (compact) {
        await coreUtils.compactFileNumbers()
        commitMsg += `\nCompacted file numbers`
      }

      await coreUtils.preProcessAndCommitFiles(commitMsg, commitFiles)
    } else {
      throw new ChptrError(`File with id ${chapterId.toString()} does not have many 1st level titles.  Nothing to split.`, 'split.run', 49)
    }
  }

  private splitContentByTitles(initialContent: string): string[][] {
    const titleRegex = /(\n# .*?\n\n)/gm
    const preResult = initialContent.split(titleRegex).filter(Boolean).reverse()
    const result: string[][] = []
    while (preResult.length > 0) {
      result.push([preResult.pop() || '', preResult.pop() || ''])
    }

    debug(`result=${JSON.stringify(result, null, 2)}`)
    return result
  }
}
