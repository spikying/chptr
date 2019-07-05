import { Command, flags } from '@oclif/command'
import * as deb from 'debug';
import * as fs from 'fs';
import * as glob from "glob";
import * as path from "path";
import * as simplegit from 'simple-git/promise';
import { MoveSummary } from 'simple-git/typings/response';
import { promisify } from "util";

import { Config } from "../config";
import { getHighestNumberAndDigits, numDigits } from '../helpers';

export const readFile = promisify(fs.readFile)
export const writeFile = promisify(fs.writeFile)
export const createFile = promisify(fs.writeFile);
export const writeInFile = promisify(fs.write);
export const copyFile = promisify(fs.copyFile)
export const moveFile = promisify(fs.rename)
export const listFiles = promisify(glob);
export const createDir = promisify(fs.mkdir);
export const deleteFile = promisify(fs.unlink)
export const fileExists = async function (path: fs.PathLike): Promise<boolean> {
  return new Promise(resolve => {
    fs.access(path, err => {
      if (err) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

export const globPromise = promisify(glob)

export const d = deb

const debug = d('command:base')

export default abstract class extends Command {

  static flags = {
    help: flags.help({ char: "h" }),
    path: flags.string(
      {
        char: "p",
        default: ".",
        description: "Path where root of project files are"
      })
  }

  private _configInstance: Config | undefined
  public get configInstance(): Config {
    return this._configInstance as Config
  }

  private _git: simplegit.SimpleGit | undefined
  public get git(): simplegit.SimpleGit {
    if (!this._git) {
      this._git = simplegit(this.configInstance.projectRootPath);
    }
    return this._git //as simplegit.SimpleGit // || simplegit()
  }

  async init() {
    // do some initialization
    debug('Starting base init')
    const { flags } = this.parse(this.constructor as any)
    // this.flags = flags
    const dir = path.join(flags.path as string);
    this._configInstance = new Config(dir);

    debug('Ended base init')
  }

  async catch(err: Error) {
    // handle any error from the command
    this.error(err)
    this.exit(1)
  }
  async finally() { // parameter (err)
    // called after run and catch regardless of whether or not the command errored
  }

  public async addDigitsToNecessaryStacks(): Promise<void> {
    const files = await this.configInstance.getAllNovelFilesFromDir()
    const normalHighest = getHighestNumberAndDigits(files, this.configInstance.chapterRegex(false))
    const atHighest = getHighestNumberAndDigits(files, this.configInstance.chapterRegex(true))

    const bothStacks = [{ atNumbering: true, highest: atHighest }, { atNumbering: false, highest: normalHighest }]

    for (const stack of bothStacks) {
      const actualDigits = stack.highest.digits
      const newDigits = numDigits(stack.highest.highestNumber)
      if (newDigits > actualDigits) {
        debug('Adding digits to stack')
        await this.addDigitsToFiles(files.filter(file => this.configInstance.isAtNumbering(file) === stack.atNumbering), newDigits, stack.atNumbering)
      }
    }
  }

  private async addDigitsToFiles(files: string[], digits: number, atNumberingStack: boolean): Promise<MoveSummary[]> {
    const promises: Promise<MoveSummary>[] = []
    for (const file of files) {
      const filename = path.basename(file)
      const atNumbering = this.configInstance.isAtNumbering(filename)
      debug(`is AtNumbering?: ${atNumbering}`)

      if (atNumbering === atNumberingStack) {

        const filenumber = this.configInstance.extractNumber(file)
        const fromFilename = this.configInstance.mapFileToBeRelativeToRootPath(path.join(path.dirname(file), filename))
        const toFilename = this.configInstance.mapFileToBeRelativeToRootPath(path.join(path.dirname(file), this.configInstance.renumberedFilename(filename, filenumber, digits, atNumbering)))
        if (fromFilename !== toFilename) {
          this.log(`renaming with new file number "${fromFilename}" to "${toFilename}"`)
          promises.push(this.git.mv(fromFilename, toFilename))
        }
      }
    }
    return Promise.all(promises)
    // })
  }

}
