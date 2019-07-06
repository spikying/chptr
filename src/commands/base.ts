import { Command, flags } from '@oclif/command'
import * as deb from 'debug';
import * as fs from 'fs';
import * as glob from "glob";
import * as path from "path";
import * as simplegit from 'simple-git/promise';
import { MoveSummary } from 'simple-git/typings/response';
import { promisify } from "util";

import { Config } from "../config";
import { Context } from '../context';
// import { } from '../helpers';

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
  static hidden = true

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

  private _context: Context | undefined
  public get context(): Context {
    return this._context as Context
  }

  async init() {
    // do some initialization
    debug('Starting base init')
    const { flags } = this.parse(this.constructor as any)
    // this.flags = flags
    const dir = path.join(flags.path as string);
    this._configInstance = new Config(dir);
    this._context = new Context(this.configInstance)

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
    // const files = await this.context.getAllNovelFiles(true)

    for (const b of [true, false]) {
      const maxDigits = this.context.getMaxNecessaryDigits(b)
      const minDigits = this.context.getMinDigits(b) // numDigits(stack.highest.highestNumber)
      if (minDigits < maxDigits) {
        // await this.addDigitsToFiles(files.filter(file => this.configInstance.isAtNumbering(file) === b), maxDigits, b)
        await this.addDigitsToFiles((await this.context.getAllFilesForOneType(b, true)), maxDigits, b)
      }
    }
  }

  public async compactFileNumbers(): Promise<void> {
    const movePromises: Promise<MoveSummary>[] = []

    for (const b of [true, false]) {
      const wildcards = [
        this.configInstance.chapterWildcard(b),
        this.configInstance.metadataWildcard(b),
        this.configInstance.summaryWildcard(b)
      ]
      for (const wildcard of wildcards) {
        const files = await globPromise(path.join(this.configInstance.projectRootPath, wildcard))

        const organizedFiles: any[] = []
        for (const file of files) {
          organizedFiles.push({ number: this.context.extractNumber(file), filename: file })
        }
        debug(`organizedFiles = ${JSON.stringify(organizedFiles, null, 4)}`)

        const destDigits = this.context.getMaxNecessaryDigits(b)
        let currentNumber = this.configInstance.config.numberingInitial

        for (const file of organizedFiles.sort((a, b) => a.number - b.number)) {
          const fromFilename = this.context.mapFileToBeRelativeToRootPath(file.filename)
          const toFilename = this.context.mapFileToBeRelativeToRootPath(path.join(path.dirname(file.filename), this.context.renumberedFilename(file.filename, currentNumber, destDigits, b)))

          if (fromFilename !== toFilename) {
            debug(`Compacting from ${fromFilename} to ${toFilename}`)
            movePromises.push(this.git.mv(fromFilename, toFilename))
          }
          currentNumber += this.configInstance.config.numberingStep
        }

      }
    }

    await Promise.all(movePromises)
  }

  private async addDigitsToFiles(files: string[], newDigitNumber: number, atNumberingStack: boolean): Promise<MoveSummary[]> {
    const promises: Promise<MoveSummary>[] = []
    for (const file of files) {
      const filename = path.basename(file)
      const atNumbering = this.configInstance.isAtNumbering(filename)
      debug(`is AtNumbering?: ${atNumbering}`)

      if (atNumbering === atNumberingStack) {

        const filenumber = this.context.extractNumber(file)
        const fromFilename = this.context.mapFileToBeRelativeToRootPath(path.join(path.dirname(file), filename))
        const toFilename = this.context.mapFileToBeRelativeToRootPath(path.join(path.dirname(file), this.context.renumberedFilename(filename, filenumber, newDigitNumber, atNumbering)))
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
