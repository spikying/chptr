import { flags } from '@oclif/command'
import { cli } from "cli-ux";
// import * as d from 'debug';
// import * as fs from 'fs';
// import * as matter from 'gray-matter';
import * as path from 'path';
// import { MoveSummary } from 'simple-git/typings/response';

import { numDigits, stringifyNumber } from '../helpers';
import { getFilenameFromInput } from '../queries';

import Command, { createFile, d } from "./base";
// import { promisify } from "util";


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
    }
  ]

  static hidden = false

  async run() {
    const { args, flags } = this.parse(Add)

    const name: string = args.name || await getFilenameFromInput()
    const atNumbering = flags.atnumbered

    const dir = path.join(flags.path as string)
    const files = await this.context.getAllFilesForOneType(atNumbering)
    debug(`files from glob: ${JSON.stringify(files)}`)

    const highestNumber = this.context.getHighestNumber(atNumbering) // filesStats.highestNumber
    const nextNumber = highestNumber === 0 ? this.configInstance.config.numberingInitial : highestNumber + this.configInstance.config.numberingStep
    const newDigits = numDigits(nextNumber)

    const filledTemplateData = this.configInstance.emptyFileString.toString().replace(/{TITLE}/gmi, name) //`# ${name}\n\n...`
    const filledTemplateMeta = JSON.stringify(this.configInstance.config.metadataFields, undefined, 4).replace(/{TITLE}/gmi, name)

    const fullPathMD = path.join(
      dir,
      this.configInstance.chapterFileNameFromParameters(stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    const fullPathMeta = path.join(
      dir,
      this.configInstance.metadataFileNameFromParameters(stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    const fullPathSummary = path.join(
      dir,
      this.configInstance.summaryFileNameFromParameters(stringifyNumber(nextNumber, newDigits), name, atNumbering)
    )

    try {
      cli.action.start('Adding file(s) locally and to repository')

      const isRepo = await this.git.checkIsRepo()
      if (!isRepo) {
        throw new Error("Directory is not a repository")
      }

      const allPromises: Promise<void>[] = []
      allPromises.push(createFile(fullPathMD, filledTemplateData, { encoding: 'utf8' }))
      allPromises.push(createFile(fullPathMeta, filledTemplateMeta, { encoding: 'utf8' }))
      allPromises.push(createFile(fullPathSummary, filledTemplateData, { encoding: 'utf8' }))
      await Promise.all(allPromises)

      await this.addDigitsToNecessaryStacks()

      await this.git.add(this.context.mapFilesToBeRelativeToRootPath([fullPathMD, fullPathMeta, fullPathSummary]))
      await this.git.commit(`added ${fullPathMD}, ${fullPathMeta} and ${fullPathSummary}`)
      await this.git.push()

    } catch (err) {
      this.error(err)
    } finally {
      cli.action.stop(`Added ${fullPathMD}, ${fullPathSummary} and ${fullPathMeta}`)
    }

  }

}

