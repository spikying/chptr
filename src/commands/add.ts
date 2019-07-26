import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import yaml = require('js-yaml')
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
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

    const toStageFiles = await this.addChapterFiles(name, flags.atnumbered, args.number)

    const commitMessage = `added\n    ${toStageFiles.join('\n    ')}`

    await this.addDigitsToNecessaryStacks()
    await this.CommitToGit(commitMessage, toStageFiles)
  }

  private async addChapterFiles(name: string, atNumbering: boolean, number?: string) {
    let chapterId: ChapterId
    if (number) {
      chapterId = new ChapterId(this.softConfig.extractNumber(number), this.softConfig.isAtNumbering(number))

      const existingFile = await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId)))

      if (existingFile.length > 0) {
        throw new ChptrError(`File ${existingFile[0]} already exists`, 'add.addchapterfiles', 1)
      }
    } else {
      await this.statistics.updateStackStatistics(atNumbering)

      const highestNumber = this.statistics.getHighestNumber(atNumbering)
      chapterId = new ChapterId(
        highestNumber === 0 ? this.softConfig.config.numberingInitial : highestNumber + this.softConfig.config.numberingStep,
        atNumbering
      )
    }

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

    const fullPathsAndData = [
      {
        path: path.join(this.rootPath, this.softConfig.chapterFileNameFromParameters(chapterId, name)),
        data: filledTemplateData
      },
      {
        path: path.join(this.rootPath, this.softConfig.metadataFileNameFromParameters(chapterId, name)),
        data: filledTemplateMeta
      },
      {
        path: path.join(this.rootPath, this.softConfig.summaryFileNameFromParameters(chapterId, name)),
        data: filledTemplateData
      }
    ]

    cli.action.start('Creating file(s) locally and to repository'.actionStartColor())

    const allPromises: Promise<void>[] = []
    for (const pathAndData of fullPathsAndData) {
      allPromises.push(this.fsUtils.createFile(pathAndData.path, pathAndData.data))
    }
    await Promise.all(allPromises)
    cli.action.stop('\n    ' + fullPathsAndData.map(pad => pad.path).join('\n    ').actionStopColor())

    return this.softConfig.mapFilesToBeRelativeToRootPath(fullPathsAndData.map(pad => pad.path))
  }
}
