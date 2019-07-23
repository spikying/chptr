import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import yaml = require('js-yaml')
import * as path from 'path'

import { QueryBuilder } from '../ui-utils'

import { d } from './base'
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
      nextNumber = this.softConfig.extractNumber(args.number)

      const existingFile = await this.fsUtils.listFiles(
        path.join(this.softConfig.projectRootPath, this.softConfig.chapterWildcardWithNumber(nextNumber, atNumbering))
      )

      if (existingFile.length > 0) {
        this.error(`File ${existingFile[0]} already exists`.errorColor())
        this.exit(1)
      }
    } else {
      atNumbering = flags.atnumbered

      await this.statistics.updateStackStatistics(atNumbering)

      const highestNumber = this.statistics.getHighestNumber(atNumbering)
      nextNumber =
        highestNumber === 0 ? this.softConfig.config.numberingInitial : highestNumber + this.softConfig.config.numberingStep
    }
    const newDigits = this.fsUtils.numDigits(nextNumber)

    const emptyFileString = this.softConfig.emptyFileString.toString()
    const filledTemplateData = emptyFileString.replace(/{TITLE}/gim, name)
    const metadataObj: any = this.softConfig.config.metadataFields
    metadataObj.computed.title = name
    metadataObj.computed.wordCount = this.markupUtils.GetWordCount(filledTemplateData)
    const filledTemplateMeta =
      this.softConfig.configStyle === 'JSON5'
        ? JSON.stringify(metadataObj, undefined, 4)
        : this.softConfig.configStyle === 'YAML'
        ? yaml.safeDump(metadataObj)
        : ''

    const fullPathMD = path.join(
      this.softConfig.projectRootPath,
      this.softConfig.chapterFileNameFromParameters(this.fsUtils.stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    const fullPathMeta = path.join(
      this.softConfig.projectRootPath,
      this.softConfig.metadataFileNameFromParameters(this.fsUtils.stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    const fullPathSummary = path.join(
      this.softConfig.projectRootPath,
      this.softConfig.summaryFileNameFromParameters(this.fsUtils.stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    try {
      cli.action.start('Creating file(s) locally and to repository'.actionStartColor())

      const allPromises: Promise<void>[] = []
      allPromises.push(this.fsUtils.createFile(fullPathMD, filledTemplateData))
      allPromises.push(this.fsUtils.createFile(fullPathMeta, filledTemplateMeta))
      allPromises.push(this.fsUtils.createFile(fullPathSummary, filledTemplateData))
      await Promise.all(allPromises)
      cli.action.stop('done'.actionStopColor())

      const toStageFiles = this.softConfig.mapFilesToBeRelativeToRootPath([fullPathMD, fullPathMeta, fullPathSummary])
      const commitMessage = `added ${this.softConfig.mapFileToBeRelativeToRootPath(
        fullPathMD
      )}, ${this.softConfig.mapFileToBeRelativeToRootPath(fullPathMeta)} and ${this.softConfig.mapFileToBeRelativeToRootPath(
        fullPathSummary
      )}`

      await this.addDigitsToNecessaryStacks()
      await this.CommitToGit(commitMessage, toStageFiles)
    } catch (err) {
      this.error(err.toString().errorColor())
    }
  }
}
