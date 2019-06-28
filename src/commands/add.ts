import { cli } from "cli-ux";
import * as d from 'debug';
import * as fs from 'fs';
// import * as matter from 'gray-matter';
import * as path from 'path';
import * as simplegit from 'simple-git/promise';

import { getFilenameFromInput } from '../common';
// import { config } from '../config'
import { addDigitsToAll, getHighestNumberAndDigits, mapFilesToBeRelativeToRootPath, numDigits, stringifyNumber, walk } from '../helpers';

import Command from "./base";

const debug = d('command:add')

export default class Add extends Command {
  static description = 'Adds a file or set of files as a new chapter, locally and in repository'

  static flags = {
    ...Command.flags
    // ,
    // folderStructure: flags.boolean({
    //   char: 'f',
    //   description: 'puts file(s) in a folder structure',
    //   default: false
    // }),
    // single: flags.boolean({
    //   char: 's',
    //   description: 'creates a single combined file',
    //   default: false
    // })
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

    const name = args.name || await getFilenameFromInput()

    // const single = this.configInstance.config.metadataPattern === ''

    const dir = path.join(flags.path as string)
    this.log(`Walking directory ${JSON.stringify(dir)}`)

    await walk(dir, false, 0, async (err, files) => {
      if (err) {
        this.error(err)
        this.exit(1)
      }

      // const numberedFiles = files
      //   .filter(value => {
      //     return value.number >= 0
      //   })
      //   .sort((a, b) => {
      //     const aNum = a.number
      //     const bNum = b.number
      //     return bNum - aNum
      //   })

      // const highestNumber = numberedFiles[0].number
      // debug(`highest number = ${highestNumber}`)
      const filesStats = getHighestNumberAndDigits(files)
      const highestNumber = filesStats.highestNumber
      const actualDigits = filesStats.digits
      const newDigits = numDigits(highestNumber + 1)
      if (newDigits > actualDigits) {
        await addDigitsToAll(dir, newDigits)
      }

      //TODO: implement those in config
      const templateData = `# ${name}\n\n...`
      const templateMeta = {
        name,
        summary: `.
.
.`,
        datetimeRange: '',
        revisionStep: 0,
        characters: [],
        mainCharacter: '',
        mainCharacterQuest: '',
        otherQuest: '',
        wordCount: 0
      }

      try {
        cli.action.start('Adding file(s) locally and to repository')

        const git = simplegit(this.configInstance.projectRootPath);
        const isRepo = await git.checkIsRepo()
        if (!isRepo) {
          throw new Error("Directory is not a repository")
        }

        const fullPathMD = path.join(
          dir,
          this.configInstance.chapterFileNameFromParameters(stringifyNumber(highestNumber + 1, newDigits), name)
        )
        // if (single) {
        //   const template = matter.stringify(templateData, templateMeta)
        //   debug(template)

        //   fs.writeFileSync(fullPathMD, template, { encoding: 'utf8' })
        //   this.log(`Added ${fullPathMD}`)
        //   await git.add(mapFilesToBeRelativeToRootPath([fullPathMD], this.configInstance.projectRootPath))
        //   await git.commit(`added ${fullPathMD}`)
        //   await git.push()
        // } else {
        const fullPathMeta = path.join(
          dir,
          this.configInstance.metadataFileNameFromParameters(stringifyNumber(highestNumber + 1, newDigits), name)
        )
        debug(JSON.stringify(templateMeta, null, 4))
        fs.writeFileSync(fullPathMD, templateData, { encoding: 'utf8' })
        fs.writeFileSync(fullPathMeta, JSON.stringify(templateMeta, null, 4), {
          encoding: 'utf8'
        })
        this.log(`Added ${fullPathMD} and ${fullPathMeta}`)
        await git.add(mapFilesToBeRelativeToRootPath([fullPathMD, fullPathMeta], this.configInstance.projectRootPath))
        await git.commit(`added ${fullPathMD} and ${fullPathMeta}`)
        await git.push()
        // }
      } catch (err) {
        this.error(err)
      } finally {
        cli.action.stop()
      }
    })
  }
}
