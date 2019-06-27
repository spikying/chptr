import { flags } from '@oclif/command'
import { integer } from '@oclif/parser/lib/flags';
import { cli } from "cli-ux";
import * as d from 'debug';
import * as minimatch from 'minimatch'
import * as path from "path";
import * as simplegit from 'simple-git/promise';

import { QueryBuilder } from '../common';
import { filterNumbers, mapFilesToBeRelativeToRootPath, walk } from '../helpers';

import Command from "./edit-save-base";

const debug = d('command:edit')

export default class Edit extends Command {
  static description = 'Adjust sentence and paragraph endings to allow for easier editing.'

  static flags = {
    ...Command.flags
  }

  static args = [{
    name: 'filter',
    description: 'Chapter number(s) to modify, comma-separated.',
    required: false,
    default: ''
  }]

  static aliases = ['modify', 'mod']

  async run() {
    const { args, flags, argv } = this.parse(Edit)

    const toEditFiles: string[] = []
    if (argv.length === 0) {
      //no chapter given; must ask for it
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('filter', queryBuilder.textinput("What chapters to put in edit mode? (comma-separated list)", ""))

      const queryResponses: any = await queryBuilder.responses()
    } else {
      //loop through all argv[i] to get all chapter numbers.
    }

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
