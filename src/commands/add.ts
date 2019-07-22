import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { QueryBuilder } from '../ui-utils'

import { d, numDigits, stringifyNumber } from './base'
import Command from './initialized-base'

const debug = d('command:add')

export default class Add extends Command {
  static description = 'Adds a file or set of files as a new chapter, locally and in repository'

  static flags = {
    ...Command.flags,
    atnumbered: flags.boolean({
      char: 'a',
      description: 'Add an @numbered chapter',
      default: false
    })
  }

  static args = [
    {
      name: 'name',
      description: 'name of chapter file(s) to add',
      required: false,
      default: ''
    },
    {
      name: 'number',
      description:
        'force this number to be used, if available.  If this argument is given, the `atnumbered` flag is ignored.  AtNumbering will be determined by the presence or absence of @ sign.',
      required: false
    }
  ]

  static hidden = false

  async run() {
    debug(`Running Add command`)
    const { args, flags } = this.parse(Add)

    const queryBuilder = new QueryBuilder()
    if (!args.name) {
      queryBuilder.add('name', queryBuilder.filename('What name do you want as a filename?'))
    }

    const queryResponses: any = await queryBuilder.responses()

    const name: string = args.name || queryResponses.name

    let atNumbering: boolean
    let nextNumber: number

    if (args.number) {
      atNumbering = args.number.substring(0, 1) === '@'
      nextNumber = this.configInstance.extractNumber(args.number)

      const existingFile = await this.fsUtils.listFiles(
        path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber(nextNumber, atNumbering))
      )

      if (existingFile.length > 0) {
        this.error(`File ${existingFile[0]} already exists`.errorColor())
        this.exit(1)
      }
    } else {
      atNumbering = flags.atnumbered

      await this.statistics.updateStackStatistics(atNumbering)

      const highestNumber = this.statistics.getHighestNumber(atNumbering)
      nextNumber = highestNumber === 0 ? this.configInstance.config.numberingInitial : highestNumber + this.configInstance.config.numberingStep
    }
    const newDigits = numDigits(nextNumber)

    const emptyFileString = this.configInstance.emptyFileString.toString()
    const filledTemplateData = emptyFileString.replace(/{TITLE}/gim, name)
    const metadataObj: any = this.configInstance.config.metadataFields
    metadataObj.computed.title = name
    metadataObj.computed.wordCount = this.markupUtils.GetWordCount(filledTemplateData)
    const filledTemplateMeta = JSON.stringify(metadataObj, undefined, 4) //.replace(/{TITLE}/gim, name)

    const fullPathMD = path.join(
      this.configInstance.projectRootPath,
      this.configInstance.chapterFileNameFromParameters(stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    const fullPathMeta = path.join(
      this.configInstance.projectRootPath,
      this.configInstance.metadataFileNameFromParameters(stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    const fullPathSummary = path.join(
      this.configInstance.projectRootPath,
      this.configInstance.summaryFileNameFromParameters(stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    try {
      cli.action.start('Creating file(s) locally and to repository'.actionStartColor())

      const allPromises: Promise<void>[] = []
      allPromises.push(this.fsUtils.createFile(fullPathMD, filledTemplateData))
      allPromises.push(this.fsUtils.createFile(fullPathMeta, filledTemplateMeta))
      allPromises.push(this.fsUtils.createFile(fullPathSummary, filledTemplateData))
      await Promise.all(allPromises)
      cli.action.stop('done'.actionStopColor())

      const toStageFiles = this.configInstance.mapFilesToBeRelativeToRootPath([fullPathMD, fullPathMeta, fullPathSummary])
      const commitMessage = `added ${this.configInstance.mapFileToBeRelativeToRootPath(fullPathMD)}, ${this.configInstance.mapFileToBeRelativeToRootPath(
        fullPathMeta
      )} and ${this.configInstance.mapFileToBeRelativeToRootPath(fullPathSummary)}`

      await this.addDigitsToNecessaryStacks()
      await this.CommitToGit(commitMessage, toStageFiles)
    } catch (err) {
      this.error(err.toString().errorColor())
    }
  }
}
