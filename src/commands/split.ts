import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'

import { d } from './base'
import Command from './compactable-base'

const debug = d('split')

export default class Split extends Command {
  static description = 'Outputs a chapter file for each `# Title level 1` in an original chapter.'

  static flags = {
    ...Command.flags,
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false
    }),
    type: flags.string({
      char: 't',
      description: 'Parse either chapter file or summary file.  The other file will be copied in full.',
      default: 'chapter',
      options: ['summary', 'chapter'],
      required: true
    })
  }

  static args = [{ name: 'origin', description: 'Chapter number to split', required: false }]

  static aliases = ['divide']

  async run() {
    debug('In Split command')
    const { args, flags } = this.parse(Split)
    const type = flags.type
    const compact = flags.compact

    debug(`args: ${JSON.stringify(args)}`)
    const chapterId = await this.coreUtils.checkArgPromptAndExtractChapterId(args.origin, 'What chapter to split?')
    if (!chapterId) {
      throw new ChptrError('No chapter found with id given', 'split.run', 45)
    }
    debug(`chapterId = ${chapterId.toString()}`)

    let commitMsg = `Split ${type} ${chapterId.toString()} `

    const toAnalyseFiles = await this.fsUtils.listFiles(
      path.join(
        this.rootPath,
        type === 'chapter'
          ? this.softConfig.chapterWildcardWithNumber(chapterId)
          : type === 'summary'
          ? this.softConfig.summaryWildcardWithNumber(chapterId)
          : ''
      )
    )
    const toAnalyseFile = toAnalyseFiles && toAnalyseFiles.length === 1 ? toAnalyseFiles[0] : null
    if (!toAnalyseFile) {
      throw new ChptrError('There should be one and only one file fitting this pattern.', 'split.run', 16)
    }
    let toEditPretty = `\n    analyzing from file ${this.softConfig.mapFileToBeRelativeToRootPath(toAnalyseFile)}`
    const initialContent = await this.fsUtils.readFileContent(toAnalyseFile)
    const replacedContents = await this.splitContentByTitles(initialContent)

    if (replacedContents.length > 1) {
      cli.info('Stashing chapter files...'.resultNormalColor())
      const atEndNum = this.statistics.getHighestNumber(true)

      //move file to the end of the atnumber pile unless it's already there
      if (!chapterId.isAtNumber || chapterId.num !== atEndNum) {
        await this.coreUtils.reorder(`${chapterId.toString()}`, '@end')
      }

      cli.info('Reading and processing chapter...'.resultNormalColor())

      // await this.statistics.updateStackStatistics(true, true)
      await this.statistics.refreshStats()
      const stashedId = new ChapterId(this.statistics.getHighestNumber(true), true)
      debug(`stashedId=${stashedId.toString()}`)
      await cli.anykey()

      cli.info('Adding new chapters...'.resultNormalColor())
      commitMsg += `in ${replacedContents.length} parts:`

      const addedTempIds: ChapterId[] = []
      for (let i = 0; i < replacedContents.length; i++) {
        const titleAndContentPair = replacedContents[i]
        const title = this.markupUtils.extractTitleFromString(titleAndContentPair[0]) || 'chapter'
        commitMsg += `\n    ${title}`

        await this.statistics.refreshStats()
        const addedFiles = await this.coreUtils.addChapterFiles(title, true)
        await this.gitUtils.add(addedFiles)
        cli.info(`Added\n    ${addedFiles.join('\n    ')}`)

        const newId = new ChapterId(stashedId.num + i + 1, true)
        const filename =
          type === 'chapter'
            ? this.softConfig.chapterFileNameFromParameters(newId, title)
            : type === 'summary'
            ? this.softConfig.summaryFileNameFromParameters(newId, title)
            : ''

        const filepath =path.join(this.rootPath, filename)
        const newContent = this.coreUtils.processContent(titleAndContentPair.join(''))
        debug(`filepath: ${filepath}\nnewContent:\n${newContent}`)
        await this.fsUtils.writeFile(filepath, newContent)

        if (type === 'chapter') {
          await this.markupUtils.UpdateSingleMetadata(filepath)
        }

        addedTempIds.push(newId)
      }

      cli.info('Reinserting newly created chapters...'.resultNormalColor())
      commitMsg += `\nwith Ids `

      for (let i = 0; i < addedTempIds.length; i++) {
        const addedId = addedTempIds[i]
        toEditPretty += `\n    inserted chapter ${addedId.toString()}`

        await this.statistics.refreshStats()
        await this.coreUtils.reorder(addedId.toString(), `${chapterId.isAtNumber ? '@' : ''}${chapterId.num + i}`)
        commitMsg += `${chapterId.isAtNumber ? '@' : ''}${chapterId.num + i}, `
      }
      commitMsg = commitMsg.replace(/, $/, '')

      cli.info(`modified files:${toEditPretty.resultHighlighColor()}`.resultNormalColor())

      await this.coreUtils.deleteFilesFromRepo(stashedId.toString())

      if (compact) {
        await this.coreUtils.compactFileNumbers()
        commitMsg += `\nCompacted file numbers`
      }

      await this.coreUtils.preProcessAndCommitFiles(commitMsg)
    } else {
      throw new ChptrError(`File with id ${chapterId.toString()} does not have many 1st level titles.  Nothing to split.`, 'split.run', 49)
    }
  }

  private splitContentByTitles(initialContent: string): string[][] {
    const titleRegex = /(\n# .*?\n\n)/gm
    const preResult = initialContent
      .split(titleRegex)
      .filter(v => v)
      .reverse()
    const result: string[][] = []
    while (preResult.length > 0) {
      result.push([preResult.pop() || '', preResult.pop() || ''])
    }

    debug(`result=${JSON.stringify(result, null, 2)}`)
    return result
  }
}
