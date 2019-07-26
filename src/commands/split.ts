import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'

import { d } from './base'
import Command from './initialized-base'

const debug = d('split')

export default class Split extends Command {
  static description = 'Outputs a chapter file for each `# Title level 1` in an original chapter.'

  //TODO: actually call compact if flag is on
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

  // TODO: extract needed functions from Reorder, Add and Delete so all these operations can be saved a single time. Make sure everything is commited.
  // TODO: update metadata files of splitted files
  async run() {
    debug('In Split command')
    const { args, flags } = this.parse(Split)
    const type = flags.type

    debug(`args: ${JSON.stringify(args)}`)
    const chapterId = await this.checkArgPromptAndExtractChapterId(args.origin, 'What chapter to split?')
    if (!chapterId) {
      throw new ChptrError('No chapter found with id given', 'split.run', 45)
    }
    debug(`chapterId = ${chapterId.toString()}`)
    // let chapterId = args.origin
    // if (!chapterId) {
    //   //no chapter given; must ask for it
    //   const queryBuilder = new QueryBuilder()
    //   queryBuilder.add('origin', queryBuilder.textinput('What chapter to split?', ''))
    //   const queryResponses: any = await queryBuilder.responses()
    //   chapterId = queryResponses.origin
    // }

    // const isAtNumbering = this.softConfig.isAtNumbering(chapterId)
    // await this.statistics.updateStackStatistics(isAtNumbering)
    // const num: number = this.isEndOfStack(chapterId)
    //   ? this.statistics.getHighestNumber(isAtNumbering)
    //   : this.softConfig.extractNumber(chapterId)

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
        // await Reorder.run([`--path=${flags.path}`, `${isAtNumbering ? '@' : ''}${num}`, '@end'])
        await this.reorder(`${chapterId.toString()}`, '@end')
      }

      cli.info('Reading and processing chapter...'.resultNormalColor())

      await this.statistics.updateStackStatistics(true, true)
      // const stashedNumber = this.statistics.getHighestNumber(true)
      const stashedId = new ChapterId(this.statistics.getHighestNumber(true), true)
      // const toEditFiles = await this.fsUtils.listFiles(
      //   path.join(
      //     this.rootPath,
      //     type === 'chapter'
      //       ? this.softConfig.chapterWildcardWithNumber(stashedId)
      //       : type === 'summary'
      //         ? this.softConfig.summaryWildcardWithNumber(stashedId)
      //         : ''
      //   )
      // )
      // const toEditFile = toEditFiles && toEditFiles.length === 1 ? toEditFiles[0] : null
      // if (!toEditFile) {
      //   throw new ChptrError('There should be one and only one file fitting this pattern.', 'split.run', 16)
      // }
      // let toEditPretty = `\n    extracted from file ${this.softConfig.mapFileToBeRelativeToRootPath(toEditFile)}`

      cli.info('Adding new chapters...'.resultNormalColor())
      // try {
      const addedTempIds: ChapterId[] = []
      for (let i = 0; i < replacedContents.length; i++) {
        const titleAndContentPair = replacedContents[i]
        const name = this.markupUtils.extractTitleFromString(titleAndContentPair[0]) || 'chapter'

        // await Add.run([`--path=${flags.path}`, '-a', name])
        await this.statistics.getAllNovelFiles(true)
        const addedFiles = await this.addChapterFiles(name, true)
        debug(`addedfiles=${addedFiles}`)
        await this.git.add(addedFiles)
        cli.info(`Added\n    ${addedFiles.join('\n    ')}`)

        // const newNumber = stashedNumber + i + 1
        // const digits = this.fsUtils.numDigits(newNumber)
        const newId = new ChapterId(stashedId.num + i + 1, true)
        const filename =
          type === 'chapter'
            ? this.softConfig.chapterFileNameFromParameters(newId, name)
            : type === 'summary'
            ? this.softConfig.summaryFileNameFromParameters(newId, name)
            : ''

        const filepath =path.join(this.rootPath, filename)
        const newContent = this.processContent(this.processContentBack(titleAndContentPair.join('')))
        debug(`filepath: ${filepath}\nnewContent:\n${newContent}`)
        await this.fsUtils.writeFile(filepath, newContent)

        if (type === 'chapter') {
          await this.markupUtils.UpdateSingleMetadata(filepath)
        }

        addedTempIds.push(newId)
      }

      cli.info('Reinserting newly created chapters...'.resultNormalColor())

      for (let i = 0; i < addedTempIds.length; i++) {
        const addedId = addedTempIds[i]
        toEditPretty += `\n    inserted chapter ${addedId.toString()}`

        // await Reorder.run([`--path=${flags.path}`, `@${addedNumber}`, `${isAtNumbering ? '@' : ''}${num + i}`])
        await this.statistics.getAllNovelFiles(true)
        await this.reorder(addedId.toString(), `${chapterId.isAtNumber ? '@' : ''}${chapterId.num + i}`)
      }

      cli.info(`modified files:${toEditPretty.resultHighlighColor()}`.resultNormalColor())

      // await Delete.run([`--path=${flags.path}`, stashedId.toString()])
      await this.deleteFilesFromRepo(stashedId.toString())

      // } catch (err) {
      //   this.error(err.toString().errorColor())
      //   this.exit(1)
      // }
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
