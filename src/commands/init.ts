import {Command, flags} from '@oclif/command'
import * as d from 'debug'
import * as fs from 'fs'
import * as json from 'json5'
import * as path from 'path'

import {getFilenameFromInput} from '../common'
import {Config} from '../config'
import {stringifyNumber} from '../helpers'

const debug = d('command:init')

export default class Init extends Command {
  // export default class Init extends Add {
  static description = 'Generates basic config files for a new novel project'

  static flags = {
    help: flags.help({char: 'h'}),
    digits: flags.string({
      char: 'd',
      default: '2',
      description:
        'Number of digits to use in file numbering initially.  Defaults to `2`.'
    }),
    path: flags.string({
      char: 'p',
      default: '.',
      description: 'Path where root of project files are'
    }),
    force: flags.boolean({
      char: 'd',
      description: 'Overwrite config files if they exist',
      default: false
    })
  }

  static args = [
    {
      name: 'name',
      description: 'Name of project',
      required: false,
      default: ''
    }
  ]

  async run() {
    const {args, flags} = this.parse(Init)

    const name =
      args.name ||
      (await getFilenameFromInput(
        'What is the project working name?',
        'MyNovel'
      ))
    const dir = path.join(flags.path as string)
    const configInstance = new Config(dir)

    // Create folder structure, with /config /chapters /characters /places /props /timeline
    fs.mkdir(configInstance.configPath, err => {
      if (err) {
        debug(err)
        this.warn(
          `/config directory already exists in ${dir}, or filesystem access denied.`
        )
      }

      if (!flags.force && fs.existsSync(configInstance.configFilePath)) {
        this.warn(
          `${
            configInstance.configFilePath
          } already exists.  Use option --force to overwrite.`
        )
      } else {
        fs.writeFile(
          configInstance.configFilePath,
          json.stringify(configInstance.configDefaultsWithMeta, null, 4),
          err => {
            if (err) {
              this.error(err)
              this.exit(1)
            } else {
              this.log(
                `Created ${configInstance.configFilePath} with basic config.`
              )
            }
          }
        )
      }

      if (!flags.force && fs.existsSync(configInstance.emptyFilePath)) {
        this.warn(
          `${
            configInstance.emptyFilePath
          } already exists.  Use option --force to overwrite.`
        )
      } else {
        fs.writeFile(
          configInstance.emptyFilePath,
          configInstance.emptyFileString,
          err => {
            if (err) {
              this.error(err)
              this.exit(1)
            } else {
              this.log(
                `Created ${
                  configInstance.emptyFilePath
                } with basic empty file template.`
              )
            }
          }
        )
      }
      // Create /config files: config.json5, empty.md, fields.json5

      // Create git repo
    })
  }
}
