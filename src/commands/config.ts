import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'

import { QueryBuilder } from '../queries'

import { d, writeFile } from './base'
import Command from './initialized-base'

const debug = d('command:config')

export default class Config extends Command {
  static description = 'Modify some parts of the config and have it updated in whole project'

  static flags = {
    ...Command.flags,
    exportManualMetadata: flags.boolean({
      char: 'e',
      description: 'Export a clean JSON file with all manual fields to track',
      required: false,
      default: false
    })
  }

  static args = [{name: 'file'}]

  static hidden = false

  async run() {
    debug('Running Config command')

    const { args, flags } = this.parse(Config)

    const exportManualMetadata = flags.exportManualMetadata

    if (exportManualMetadata) {
  writeFile(path.join(this.hardConfig.configPath, ''))
}


  }
}
