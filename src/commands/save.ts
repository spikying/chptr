import { flags } from '@oclif/command'
import { cli } from "cli-ux";
// import * as d from 'debug';
// import * as glob from "glob";
import * as minimatch from 'minimatch'
import * as path from "path";
import * as simplegit from 'simple-git/promise';
// import { promisify } from "util";

import { QueryBuilder } from '../common';
import { filterNumbers, mapFilesToBeRelativeToRootPath, walk } from '../helpers';

import { d } from './base';
import Command from "./edit-save-base";

const debug = d('command:save')
// const listFiles = promisify(glob);

export default class Save extends Command {
  static description = 'Parse modified text files, adjust sentence and paragraph endings, commit files to repository and readjust endings.'

  static flags = {
    ...Command.flags,
    filter: flags.string({
      char: 'f',
      required: false,
      default: '',
      parse: filterNumbers,
      description: 'Chapter number to filter which files to stage before saving to repository'
    })
  }

  static args = [{
    name: 'message',
    description: 'Message to use in commit to repository',
    required: false,
    default: ''
  }]

  static aliases = ['commit']

  async run() {
    const { args, flags } = this.parse(Save)

    const numberFilter = flags.filter ? parseInt(flags.filter, 10) : undefined

    const queryBuilder = new QueryBuilder()
    // debug(`args.message = ${args.message}`)
    if (!args.message) {
      queryBuilder.add('message', queryBuilder.textinput("Message to use in commit to repository?", ""))
    }

    const queryResponses: any = await queryBuilder.responses()

    const git = simplegit(this.configInstance.projectRootPath);
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      throw new Error("Directory is not a repository")
    }

    // const pathName = path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber())
    const toAddFiles = (await git.diff(['--name-only']))
      .split('\n')
      .filter(val => val !== '')
      .filter(val => {
        // debug(`numberFilter=${numberFilter}; val=${val}; minimatch=${minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter || 0))}`)
        return numberFilter ? minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter)) : true
      }) // listFiles(pathName)
    debug(`toAddFiles: ${JSON.stringify(toAddFiles)}`)

    if (toAddFiles.length === 0) {
      this.error('No files to save to repository')
      this.exit(0)
    }

    cli.action.start('Reading and processing modified files')
    await toAddFiles.forEach(async filename => {
      const fullPath = path.join(this.configInstance.projectRootPath, filename)
      await this.processFileBack(fullPath)
      await this.processFile(fullPath)
    });
    cli.action.stop(`done ${toAddFiles.join(' ')}`)

    let message: any = args.message || queryResponses.message || 'Modified files:'
    message += '\n' + `${JSON.stringify(toAddFiles)}`
    debug(`message: ${message}`)

    try {
      cli.action.start('Saving file(s) in repository')

      debug(`Message= ${message}; toAddFiles=${JSON.stringify(toAddFiles)}`)

      await git.commit(message, toAddFiles)
      await git.push()
      await git.pull()

    } catch (err) {
      this.error(err)
    } finally {
      cli.action.stop(`Commited and pushed ${message}`)
    }

    // cli.action.start('Processing back files')
    // await toAddFiles.forEach(async filename => {
    //   const fullPath = path.join(this.configInstance.projectRootPath, filename)
    //   await this.processFileBack(fullPath)
    // });
    // cli.action.stop()
  }


}
