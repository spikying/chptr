import { flags } from '@oclif/command'
import { cli } from "cli-ux";
// import * as d from 'debug';
// import * as glob from "glob";
import * as minimatch from 'minimatch'
import * as path from "path";
import { CommitSummary } from 'simple-git/typings/response';

// import { filterNumbers } from '../helpers';
import { QueryBuilder } from '../queries';

import { d, fileExists } from './base';
import Command from "./edit-save-base";
// import { promisify } from "util";


const debug = d('command:save')
// const listFiles = promisify(glob);

export default class Save extends Command {
  static description = 'Parse modified text files, adjust sentence and paragraph endings, commit files to repository (remove deleted ones) and readjust endings.'

  static flags = {
    ...Command.flags,
    filter: flags.string({
      char: 'f',
      required: false,
      default: '',
      // parse: filterNumbers,
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

  static hidden = false

  async run() {
    const { args, flags } = this.parse(Save)

    const atFilter = flags.filter ? flags.filter.substring(0, 1) === '@' : false
    const numberFilter = flags.filter ? this.context.extractNumber(flags.filter) : null

    const queryBuilder = new QueryBuilder()
    if (!args.message) {
      queryBuilder.add('message', queryBuilder.textinput("Message to use in commit to repository?", ""))
    }

    const queryResponses: any = await queryBuilder.responses()

    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) {
      throw new Error("Directory is not a repository")
    }

    // const pathName = path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber())
    const gitStatus = await this.git.status()
    debug(`git status\n${JSON.stringify(gitStatus, null, 4)}`)

    const unQuote = function (value: string) {
      if (!value) { return value }
      return value.replace(/"(.*)"/, '$1')
    }

    const onlyUnique = function (value: any, index: number, self: any) {
      return self.indexOf(value) === index;
    }

    const unfilteredFileList = (await this.git.diff(['--name-only'])).split('\n')
      .concat(gitStatus.not_added.map(unQuote))
      .concat(gitStatus.deleted.map(unQuote))
      .concat(gitStatus.modified.map(unQuote))
      .concat(gitStatus.created.map(unQuote))
      .concat(gitStatus.renamed.map((value: any) => value.to as string).map(unQuote))
      .filter(onlyUnique)

    debug(`unfilteredFileList=\n${JSON.stringify(unfilteredFileList, null, 4)}`)

    const toAddFiles = unfilteredFileList
      .filter(val => val !== '')
      .filter(val => {
        return numberFilter ?
          minimatch(val, this.configInstance.chapterWildcardWithNumber(numberFilter, atFilter)) ||
          minimatch(val, this.configInstance.metadataWildcardWithNumber(numberFilter, atFilter)) ||
          minimatch(val, this.configInstance.summaryWildcardWithNumber(numberFilter, atFilter))
          : true
      })

    if (toAddFiles.length === 0) {
      this.warn('No files to save to repository')
    } else {

      cli.action.start('Reading and processing modified files')
      for (const filename of toAddFiles) {
        const fullPath = path.join(this.configInstance.projectRootPath, filename)
        const exists = await fileExists(fullPath)
        if (
          exists &&
          (
            this.configInstance.chapterRegex(false).test(path.basename(fullPath)) ||
            this.configInstance.chapterRegex(true).test(path.basename(fullPath))
          )
        ) {
          await this.processFileBack(fullPath)
          await this.processFile(fullPath)
        }
      }
      cli.action.stop(`done ${toAddFiles.join(' ')}`)

      let message: any = args.message || queryResponses.message || 'Modified files:'
      message += '\n' + `${JSON.stringify(toAddFiles)}`
      debug(`message: ${message}`)

      let commitSummary: CommitSummary | undefined //= {author: null,branch:'', commit: '', summary: {changes: 0, }}
      try {
        cli.action.start('Saving file(s) in repository')

        debug(`Message= ${message}; toAddFiles=${JSON.stringify(toAddFiles)}`)

        await this.git.add(toAddFiles)
        commitSummary = await this.git.commit(message)
        await this.git.push()
        await this.git.pull()

      } catch (err) {
        this.error(err)
      } finally {
        cli.action.stop(`Commited and pushed\n${JSON.stringify(commitSummary, null, 2)}`)
      }

    }

  }


}
