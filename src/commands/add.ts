import { cli } from "cli-ux";
// import * as d from 'debug';
// import * as fs from 'fs';
// import * as matter from 'gray-matter';
import * as path from 'path';
import * as simplegit from 'simple-git/promise';
// import { promisify } from "util";

import { getFilenameFromInput } from '../common';
// import { config } from '../config'
import { addDigitsToAll, getHighestNumberAndDigits, mapFilesToBeRelativeToRootPath, numDigits, stringifyNumber, walk } from '../helpers';

import Command, { createFile, d } from "./base";

const debug = d('command:add')

export default class Add extends Command {
  static description = 'Adds a file or set of files as a new chapter, locally and in repository'

  static flags = {
    ...Command.flags
  }

  static args = [
    {
      name: 'name',
      description: 'name of chapter file(s) to add',
      required: false,
      default: ''
    }
  ]

  async run() {
    const { args, flags } = this.parse(Add)

    const name: string = args.name || await getFilenameFromInput()

    const dir = path.join(flags.path as string)
    this.log(`Walking directory ${JSON.stringify(dir)}`)

    await walk(dir, false, 0, async (err, files) => {
      if (err) {
        this.error(err)
        this.exit(1)
      }

      const filesStats = getHighestNumberAndDigits(files)
      const highestNumber = filesStats.highestNumber
      const actualDigits = filesStats.digits
      const newDigits = numDigits(highestNumber + 1)
      if (newDigits > actualDigits) {
        await addDigitsToAll(dir, newDigits)
      }

      const filledTemplateData = this.configInstance.emptyFileString.toString().replace(/{TITLE}/gmi, name) //`# ${name}\n\n...`
      //TODO: implement those in config
      const filledTemplateMeta = JSON.stringify(this.configInstance.config.metadataFields, undefined, 4).replace(/{TITLE}/gmi, name)
      // {
      //   name,
      //   datetimeRange: '',
      //   revisionStep: 0,
      //   characters: [],
      //   mainCharacter: '',
      //   mainCharacterQuest: '',
      //   otherQuest: '',
      //   wordCount: 0
      // }

      const fullPathMD = path.join(
        dir,
        this.configInstance.chapterFileNameFromParameters(stringifyNumber(highestNumber + 1, newDigits), name)
      )

      const fullPathMeta = path.join(
        dir,
        this.configInstance.metadataFileNameFromParameters(stringifyNumber(highestNumber + 1, newDigits), name)
      )

      const fullPathSummary = path.join(
        dir,
        this.configInstance.summaryFileNameFromParameters(stringifyNumber(highestNumber + 1, newDigits), name)
      )

      try {
        cli.action.start('Adding file(s) locally and to repository')

        const git = simplegit(this.configInstance.projectRootPath);
        const isRepo = await git.checkIsRepo()
        if (!isRepo) {
          throw new Error("Directory is not a repository")
        }

        // debug(JSON.stringify(templateMeta, null, 4))
        const allPromises: Promise<void>[] = []
        allPromises.push(createFile(fullPathMD, filledTemplateData, { encoding: 'utf8' }))
        allPromises.push(createFile(fullPathMeta, filledTemplateMeta, { encoding: 'utf8' }))
        allPromises.push(createFile(fullPathSummary, filledTemplateData, { encoding: 'utf8' }))
        await Promise.all(allPromises)

        await git.add(mapFilesToBeRelativeToRootPath([fullPathMD, fullPathMeta, fullPathSummary], this.configInstance.projectRootPath))
        await git.commit(`added ${fullPathMD}, ${fullPathMeta} and ${fullPathSummary}`)
        await git.push()

      } catch (err) {
        this.error(err)
      } finally {
        cli.action.stop(`Added ${fullPathMD}, ${fullPathSummary} and ${fullPathMeta}`)
      }
    })
  }
}
