import { flags } from '@oclif/command'
import { cli } from "cli-ux";
import * as d from 'debug';
import * as glob from "glob";
import * as path from "path";

import { QueryBuilder } from '../common';

import Command from "./edit-save-base";

const debug = d('command:edit')

export default class Edit extends Command {
  static description = 'Adjust sentence and paragraph endings to allow for easier editing.'

  static flags = {
    ...Command.flags,
    type: flags.string(
      {
        char: 't',
        description: 'Edit either chapter file, summary file or all.',
        default: 'all',
        options: ['all', 'summary', 'chapter']
      }
    )
  }

  static args = [{
    name: 'filter',
    description: 'Chapter number(s) to modify, comma-separated.',
    required: false,
    default: ''
  }]

  static aliases = ['modify', 'mod']

  // for variable length arguments (https://oclif.io/docs/args)
  static strict = false

  async run() {
    const { args, flags, argv } = this.parse(Edit)

    const editType = flags.type
    debug(`edit type = ${editType}`)
    debug(`argv=${argv} argv.length=${argv.length} argv[0]=${argv[0]}`)

    const chapterNumbers: number[] = []
    const toEditFiles: string[] = []
    if (!argv[0]) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('filter', queryBuilder.textinput("What chapters to put in edit mode? (comma-separated list)", ""))
      const queryResponses: any = await queryBuilder.responses()
      chapterNumbers.push(...queryResponses.filter.split(',').map((v: string) => parseInt(v, 10)))
    } else {
      //loop through all argv[i] to get all chapter numbers.  If first argument contains commas, it's a single argument to split at ','.
      if (argv[0].split(',').length > 1) {
        chapterNumbers.push(...argv[0].split(',').map((v: string) => parseInt(v, 10)))
      } else {
        chapterNumbers.push(...argv.map((v: string) => parseInt(v, 10)))
      }
    }

    debug(`chapterNumbers: ${JSON.stringify(chapterNumbers)}`)

    chapterNumbers.forEach(async num => {
      debug(`glob fullpath: ${path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber(num))}`)
      const foundFiles: string[] = []
      if (editType === 'all' || editType === 'chapter') {
        debug(`adding chapter`)
        foundFiles.push(...glob.sync(path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber(num))))
      }
      if (editType === 'all' || editType === 'summary') {
        debug(`adding summary`)
        foundFiles.push(...glob.sync(path.join(this.configInstance.projectRootPath, this.configInstance.summaryWildcardWithNumber(num))))
      }
      debug(`foundFiles = ${foundFiles}`)
      toEditFiles.push(...foundFiles)
    })

    debug(`toEditFiles: ${JSON.stringify(toEditFiles)}`)

    if (toEditFiles.length === 0) {
      this.error('No files matching input')
      this.exit(0)
    }

    cli.action.start('Reading and processing modified files')
    await toEditFiles.forEach(async filename => {
      const fullPath = path.join(this.configInstance.projectRootPath, filename)
      await this.processFileBack(fullPath)
    });
    cli.action.stop()

  }


}
