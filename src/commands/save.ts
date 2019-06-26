import { flags } from '@oclif/command'
import { cli } from "cli-ux";
import * as d from 'debug';

import Command from "./base";

const debug = d('command:save')

export default class Save extends Command {
  static description = 'Parse modified text files, adjust sentence and paragraph endings, commit files to repository and readjust endings.'

  static flags = {
    ...Command.flags
  }

  static args = [{
    name: 'name',
    description: 'file pattern of files to save.',
    required: false,
    default: '**/*.*'
  }]

  async run() {
    const { args, flags } = this.parse(Save)


  }
}
