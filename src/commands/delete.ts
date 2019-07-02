import { flags } from '@oclif/command'
import { cli } from "cli-ux";
// import * as d from "debug";
// import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as simplegit from 'simple-git/promise';
// import { promisify } from "util";

import { QueryBuilder } from '../queries';
import { mapFilesToBeRelativeToRootPath } from '../helpers';

import Command, { d, listFiles } from "./base"

const debug = d("command:delete");
// const listFiles = promisify(fs.readdir);
// const listFiles = promisify(glob);

export default class Delete extends Command {
  static description = 'Delete a file locally and in the repository'

  static flags = {
    ...Command.flags,
    type: flags.string(
      {
        char: 't',
        description: 'Delete either chapter file, summary file, metadata file or all.',
        default: 'all',
        options: ['all', 'summary', 'chapter', 'metadata']
      }
    )
  }

  static args = [
    {
      name: 'name',
      description: 'filename pattern or chapter number to delete',
      required: false,
      default: ''
    }
  ]

  async run() {
    const { args, flags } = this.parse(Delete)

    const deleteType = flags.type

    const queryBuilder = new QueryBuilder()
    debug(`args.name = ${args.name}`)
    if (!args.name) {
      queryBuilder.add('name', queryBuilder.textinput("Filename part or chapter number to delete?"))
    }

    const queryResponses: any = await queryBuilder.responses()
    const nameOrNumber: any = args.name || queryResponses.name

    if (!nameOrNumber) {
      this.error("Name or number input empty")
      this.exit(1)
    }

    const toDeleteFiles: string[] = []

    if (isNaN(nameOrNumber)) {
      // we will delete all files matching the name entered
      let filePattern = '*' + nameOrNumber + '*'
      if (glob.hasMagic(nameOrNumber)) { //nameOrNumber.toString().match(/.*[\*].*/)
        filePattern = nameOrNumber
      }
      const pathName = path.join(this.configInstance.projectRootPath, filePattern)
      toDeleteFiles.push(...await listFiles(pathName))
    } else {
      // we will delete all files matching the number patterns for chapters, metadata and summary
      const globPatterns: string[] = []
      if (deleteType === 'all' || deleteType === 'chapter') {
        globPatterns.push(this.configInstance.chapterWildcardWithNumber(nameOrNumber))
      }
      if (deleteType === 'all' || deleteType === 'summary') {
        globPatterns.push(this.configInstance.summaryWildcardWithNumber(nameOrNumber))
      }
      if (deleteType === 'all' || deleteType === 'metadata') {
        globPatterns.push(this.configInstance.metadataWildcardWithNumber(nameOrNumber))
      }

      debug(`globPatterns=${JSON.stringify(globPatterns)}`)

      for (const gp of globPatterns) {
        // const gp = globPatterns[index];
        const pathName = path.join(this.configInstance.projectRootPath, gp)
        debug(`pathName = ${pathName}`)
        toDeleteFiles.push(...await listFiles(pathName))
      }
    }

    debug(`toDeleteFiles = ${JSON.stringify(toDeleteFiles)} toDeleteFiles.length = ${toDeleteFiles.length}`)

    if (toDeleteFiles.length === 0) {
      cli.warn('No files to delete.')
      cli.exit(0)
    }

    try {
      cli.action.start('Deleting file(s) locally and from repository')

      debug(`ProjetRootPath = ${this.configInstance.projectRootPath}`)
      const git = simplegit(this.configInstance.projectRootPath);
      const isRepo = await git.checkIsRepo()
      if (!isRepo) {
        throw new Error("Directory is not a repository")
      }
      await git.rm(mapFilesToBeRelativeToRootPath(toDeleteFiles, this.configInstance.projectRootPath))
      await git.commit(`Removed files: ${JSON.stringify(toDeleteFiles)}`)
      await git.push()

    } catch (err) {
      this.error(err)
    } finally {
      cli.action.stop()
    }

  }
}
