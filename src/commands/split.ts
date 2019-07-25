import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import Add from './add'
import { d } from './base'
import Delete from './delete'
import Command from './initialized-base'

const debug = d('command:split')

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

  // TODO: extract needed functions from Reorder, Add and Delete so all these operations can be saved a single time.
  // TODO: update metadata files of splitted files
  async run() {
    debug('In Split command')
    const { args, flags } = this.parse(Split)
    const type = flags.type

    let chapterId = args.origin
    if (!chapterId) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('origin', queryBuilder.textinput('What chapter to split?', ''))
      const queryResponses: any = await queryBuilder.responses()
      chapterId = queryResponses.origin
    }

    const isAtNumbering = this.softConfig.isAtNumbering(chapterId)
    await this.statistics.updateStackStatistics(isAtNumbering)
    const num: number = this.isEndOfStack(chapterId)
      ? this.statistics.getHighestNumber(isAtNumbering)
      : this.softConfig.extractNumber(chapterId)

    cli.info('Stashing chapter files...'.resultNormalColor())
    const atEndNum = this.statistics.getHighestNumber(true)

    if (!isAtNumbering || num !== atEndNum) {
      // await Reorder.run([`--path=${flags.path}`, `${isAtNumbering ? '@' : ''}${num}`, '@end'])
      await this.reorder(`${isAtNumbering ? '@' : ''}${num}`, '@end')
    }

    cli.info('Reading and processing chapter...'.resultNormalColor())

    await this.statistics.updateStackStatistics(true, true)
    const stashedNumber = this.statistics.getHighestNumber(true)
    const toEditFiles = await this.fsUtils.globPromise(
      path.join(
        this.rootPath,
        type === 'chapter'
          ? this.softConfig.chapterWildcardWithNumber(stashedNumber, true)
          : type === 'summary'
          ? this.softConfig.summaryWildcardWithNumber(stashedNumber, true)
          : ''
      )
    )
    const toEditFile = toEditFiles && toEditFiles.length === 1 ? toEditFiles[0] : null
    if (!toEditFile) {
      throw new ChptrError('There should be one and only one file fitting this pattern.', 'split.run', 16)
    }
    let toEditPretty = `\n    extracted from file ${this.softConfig.mapFileToBeRelativeToRootPath(toEditFile)}`

    const initialContent = await this.fsUtils.readFileContent(toEditFile)
    const replacedContents = await this.splitFile(initialContent)

    cli.info('Adding new chapters...'.resultNormalColor())
    // try {
    const addedTempNumbers: number[] = []
    for (let i = 0; i < replacedContents.length; i++) {
      const titleAndContentPair = replacedContents[i]
      const name = this.markupUtils.extractTitleFromString(titleAndContentPair[0]) || 'chapter'

      await Add.run([`--path=${flags.path}`, '-a', name])

      const newNumber = stashedNumber + i + 1
      const digits = this.fsUtils.numDigits(newNumber)
      const filename =
        type === 'chapter'
          ? this.softConfig.chapterFileNameFromParameters(this.fsUtils.stringifyNumber(newNumber, digits), name, true)
          : type === 'summary'
          ? this.softConfig.summaryFileNameFromParameters(this.fsUtils.stringifyNumber(newNumber, digits), name, true)
          : ''

      const newContent = this.processContent(this.processContentBack(titleAndContentPair.join('')))
      debug(`newContent:\n${newContent}`)
      await this.fsUtils.writeFile(path.join(this.rootPath, filename), newContent)

      addedTempNumbers.push(newNumber)
    }

    cli.info('Reinserting newly created chapters...'.resultNormalColor())

    for (let i = 0; i < addedTempNumbers.length; i++) {
      const addedNumber = addedTempNumbers[i]
      toEditPretty += `\n    inserted chapter ${isAtNumbering ? '@' : ''}${addedNumber}`

      // await Reorder.run([`--path=${flags.path}`, `@${addedNumber}`, `${isAtNumbering ? '@' : ''}${num + i}`])
      await this.reorder(`@${addedNumber}`, `${isAtNumbering ? '@' : ''}${num + i}`)
    }

    cli.info(`modified files:${toEditPretty.resultHighlighColor()}`.resultNormalColor())

    await Delete.run([`--path=${flags.path}`, `@${stashedNumber}`])
    // } catch (err) {
    //   this.error(err.toString().errorColor())
    //   this.exit(1)
    // }
  }

  private splitFile(initialContent: string): string[][] {
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
