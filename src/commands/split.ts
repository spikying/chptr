import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

import { QueryBuilder } from '../ui-utils'

import Add from './add'
import { d } from './base'
import Delete from './delete'
import Command from './initialized-base'
import Reorder from './reorder'

const debug = d('command:split')

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
    debug(`chapterId=${chapterId} isAtNumbering? ${isAtNumbering} isEndOfStack? ${this.isEndOfStack(chapterId)}`)
    const num: number = this.isEndOfStack(chapterId)
      ? this.statistics.getHighestNumber(isAtNumbering)
      : this.softConfig.extractNumber(chapterId)

    cli.action.start('Stashing chapter files')
    const atEndNum = this.statistics.getHighestNumber(true)

    // const { tempDir } = await this.fsUtils.getTempDir(this.softConfig.projectRootPath)

    // const toDeleteFiles = await this.statistics.getAllFilesForChapter(num, isAtNumbering, this.softConfig.projectRootPath)
    // const moveTempPromises: Promise<MoveSummary>[] = []

    // for (const file of toDeleteFiles) {
    //   const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(file)
    //   const toFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, fromFilename))

    //   await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.softConfig.projectRootPath, toFilename))

    //   debug(`moveToTemp: from ${fromFilename} to ${toFilename}`)
    //   moveTempPromises.push(this.git.mv(fromFilename, toFilename))
    // }

    // await Promise.all(moveTempPromises)

    if (!isAtNumbering || num !== atEndNum) {
      await Reorder.run([`--path=${flags.path}`, `${isAtNumbering ? '@' : ''}${num}`, '@end'])
    }
    cli.action.stop(`done`.actionStopColor())

    cli.action.start('Reading and processing chapter'.actionStartColor())

    // await this.statistics.getAllFilesForOneType(isAtNumbering, true)
    // const workingNum = atEndNum + 1 // this.statistics.getHighestNumber(true)

    await this.statistics.updateStackStatistics(true, true)
    const stashedNumber = this.statistics.getHighestNumber(true)
    const toEditFiles = await this.fsUtils.globPromise(
      path.join(
        this.softConfig.projectRootPath,
        type === 'chapter'
          ? this.softConfig.chapterWildcardWithNumber(stashedNumber, true)
          : type === 'summary'
          ? this.softConfig.summaryWildcardWithNumber(stashedNumber, true)
          : ''
      )
    )
    const toEditFile = toEditFiles && toEditFiles.length === 1 ? toEditFiles[0] : null
    if (!toEditFile) {
      throw new Error('There should be one and only one file fitting this pattern.')
    }

    try {
      const initialContent = await this.fsUtils.readFileContent(toEditFile)
      const replacedContents = await this.splitFile(initialContent)

      // const reorderList = []
      const addedTempNumbers: number[] = []
      for (let i = 0; i < replacedContents.length; i++) {
        const titleAndContentPair = replacedContents[i]

        const name = this.markupUtils.extractTitleFromString(titleAndContentPair[0]) || 'chapter'
        debug(`adding name=${name}`)
        await Add.run([`--path=${flags.path}`, '-a', name])
        const newNumber = stashedNumber + i + 1
        const digits = this.fsUtils.numDigits(newNumber)
        const filename =
          type === 'chapter'
            ? this.softConfig.chapterFileNameFromParameters(this.fsUtils.stringifyNumber(newNumber, digits), name, true)
            : type === 'summary'
            ? this.softConfig.summaryFileNameFromParameters(this.fsUtils.stringifyNumber(newNumber, digits), name, true)
            : ''

        debug(`newNumber=${newNumber} digits=${digits} filename=${filename}`)
        debug(`content=${titleAndContentPair[1]}`)
        const newContent = this.processContent(this.processContentBack(titleAndContentPair.join('')))
        await this.fsUtils.writeFile(path.join(this.softConfig.projectRootPath, filename), newContent)

        addedTempNumbers.push(newNumber)

        // reorderList.push([`@${newNumber}`, `${isAtNumbering ? '@' : ''}${num + i}`])
      }

      // const addedStashedNumbers: number[] = []

      for (let i = 0; i < addedTempNumbers.length; i++) {
        const addedNumber = addedTempNumbers[i]
        await Reorder.run([`--path=${flags.path}`, `@${addedNumber}`, `${isAtNumbering ? '@' : ''}${num + i}`])
        // const toRenameFiles = await this.statistics.getAllFilesForChapter(addedNumber, true)
        // try {
        //   for (const file of toRenameFiles) {
        //     const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, file))
        //     const newNumber = this.statistics.getHighestNumber(true) + 1
        //     const digits = this.fsUtils.numDigits(newNumber)
        //     const toFilename = this.softConfig.mapFileToBeRelativeToRootPath(this.softConfig.renumberedFilename(file, newNumber, digits, true))

        //     debug(`TEMPed file: ${fromFilename} BACK TO ${toFilename}`)

        //     // await this.fsUtils.createSubDirectoryFromFilePathIfNecessary(path.join(this.softConfig.projectRootPath, toFilename))
        //     addedStashedNumbers.push(newNumber)
        //     moveTempPromises.push(this.git.mv(fromFilename, toFilename))
        //   }

        //   await Promise.all(moveTempPromises)

        //   cli.action.stop(tempDir.actionStopColor())
        // } catch (err) {
        //   cli.error(err.toString().errorColor())
        //   cli.exit(1)
        // }
      }

      // for (let i = 0; i < addedStashedNumbers.length; i++) {
      //   const stashedNumber = addedStashedNumbers[i];

      // // }
      // // for (const stashedNumber of addedStashedNumbers) {
      //   await Reorder.run([`--path=${flags.path}`, `@${stashedNumber}`, `${isAtNumbering ? '@' : ''}${num + i}`])
      // }

      await Delete.run([`--path=${flags.path}`, `@${stashedNumber}`])
      // await this.fsUtils.writeFile(fullPath, replacedContent)
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }

    const toEditPretty = toEditFiles.map(f => `\n    ${f}`)
    cli.action.stop(`modified file${toEditFiles.length > 1 ? 's' : ''}:${toEditPretty}`.actionStopColor())
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
