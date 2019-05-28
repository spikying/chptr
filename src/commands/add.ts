import {Command, flags} from '@oclif/command'
import * as d from 'debug'
import * as fs from 'fs'
import * as inquirer from 'inquirer'
import * as path from 'path'
const debug = d('command:add')

import {sanitizeFileName, stringifyNumber, walk} from '../helpers'

export default class Add extends Command {
  static description = 'Adds a file or set of files as a new chapter'

  static flags = {
    help: flags.help({char: 'h'}),
    path: flags.string({
      char: 'p',
      default: '.',
      description: 'Path where chapter files are'
    }),
    folderStructure: flags.boolean({
      char: 'f',
      description: 'puts file(s) in a folder structure',
      default: false
    }),
    single: flags.boolean({
      char: 's',
      description: 'creates a single combined file',
      default: false
    })
  }

  static args = [
    {
      name: 'name',
      description: 'name of chapter file',
      required: false,
      default: ''
    }
  ]

  async run() {
    const {args, flags} = this.parse(Add)

    let name = args.name
    if (name === '') {
      const responses: any = await inquirer.prompt([
        {
          name: 'name',
          message: 'What name do you want as a filename?',
          type: 'input',
          default: 'chapter',
          filter: sanitizeFileName
        }
      ])
      name = responses.name
    }

    const dir = path.join(flags.path as string) //path.parse(flags.path || '')
    this.log(`Walking directory ${JSON.stringify(dir)}`)

    await walk(dir, false, 0, (err, files) => {
      if (err) {
        this.error(err)
        this.exit(1)
      }

      const re: RegExp = /^(\d+)(.*)/

      const numberedFiles = files
        .filter(value => {
          return value.number >= 0
        })
        .sort((a, b) => {
          const aNum = a.number
          const bNum = b.number //parseInt(path.basename(b.filename).replace(re, '$1'), 10) //parseInt(path.basename(b).replace(re, '$1'), 10)
          return bNum - aNum
        })
      this.log(`numberedFiles = ${JSON.stringify(files)}`)

      const highestNumber = numberedFiles[0].number
      this.log(`highest number = ${highestNumber}`)
    })
  }
}
