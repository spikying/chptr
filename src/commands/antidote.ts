// import { flags } from '@oclif/command'
import { exec } from 'child_process';
import * as d from 'debug';
import * as fs from 'fs';
import * as path from "path";
import { promisify } from "util";

import Command from "./base"

const debug = d('command:antidote')

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

export default class Antidote extends Command {
  static description = 'Launch Antidote spell-checker'

  static flags = {
    ...Command.flags
  }

  static args = [{
    name: 'filter',
    description: 'Chapter number(s) to modify, comma-separated.',
    required: false,
    default: ''
  }]

  async run() {
    const { args, flags } = this.parse(Antidote)

    const basicFilePath = path.join(this.configInstance.projectRootPath, '22 gros.md')
    await this.turnToUTF8BOM(basicFilePath)

    const filePath = `"${path.resolve(basicFilePath)}"`
    debug(`filePath = ${filePath}`)
    await this.runAntidote([filePath])

  }

  private async runAntidote(options: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = 'antidote ' + options.join(' ')
      debug(`before executing child process with command ${command}`)
      exec(command, (err, pout, perr) => {
        debug('finished child process')
        if (err) {
          this.error(err)
          reject(err)
        }
        if (perr) {
          this.error(perr)
          reject(perr)
        }
        if (pout) {
          this.log(pout)
        }
        resolve()
      })

    })
  }

  private async turnToUTF8BOM(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)

      if (initialContent.charCodeAt(0) !== 65279) {
        const replacedContent = String.fromCharCode(65279) + initialContent
        debug(`Processed content: \n${replacedContent.substring(0, 250)}`)
        await writeFile(filepath, replacedContent, 'utf8')
      }
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

}
