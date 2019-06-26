import { flags } from '@oclif/command'
import { cli } from "cli-ux";
import * as d from "debug";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as simplegit from 'simple-git/promise';
import { promisify } from "util";

import { QueryBuilder } from '../common';

import Command from "./base"
import { mapFilesToBeRelativeToRootPath } from '../helpers';

const debug = d("command:delete");
// const listFiles = promisify(fs.readdir);
const listFiles = promisify(glob);

export default class Delete extends Command {
  static description = 'Delete a file locally and in the repository'

  static flags = {
    ...Command.flags
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
      if (nameOrNumber.toString().match(/.*[\*].*/)) {
        filePattern = nameOrNumber
      }
      const pathName = path.join(this.configInstance.projectRootPath, filePattern)
      toDeleteFiles.push(...await listFiles(pathName))
    } else {
      // we will delete all files matching the number patterns for chapters and metadata
      const pathName = path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber(nameOrNumber))
      debug(`pathName = ${pathName}`)
      toDeleteFiles.push(...await listFiles(pathName))
    }
    // toDeleteFiles = toDeleteFiles.map<string>((filename) => {
    //   return path.relative(this.configInstance.projectRootPath, filename)
    // });
    debug(`toDeleteFiles = ${JSON.stringify(toDeleteFiles)}`)

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
