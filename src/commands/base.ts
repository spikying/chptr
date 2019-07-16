import { Command, flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as deb from 'debug'
import * as fs from 'fs'
import * as glob from 'glob'
import * as latinize from 'latinize'
import * as notifier from 'node-notifier'
import * as path from 'path'
import * as sanitize from 'sanitize-filename'
import * as simplegit from 'simple-git/promise'
import { MoveSummary } from 'simple-git/typings/response'
import { promisify } from 'util'

import { Config } from '../config'
import { Context } from '../context'

export const readFile = promisify(fs.readFile)
export const writeFile = promisify(fs.writeFile)
export const createFile = promisify(fs.writeFile)
export const writeInFile = promisify(fs.write)
export const copyFile = promisify(fs.copyFile)
export const moveFile = promisify(fs.rename)
export const listFiles = promisify(glob)
export const createDir = promisify(fs.mkdir)
export const deleteDir = promisify(fs.rmdir)
export const deleteFile = promisify(fs.unlink)
export const mkdtemp = promisify(fs.mkdtemp)
export const fileExists = async function(path: fs.PathLike): Promise<boolean> {
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
const chalk: any = require('chalk')
String.prototype.color = function(colorName: string) {
  return chalk[colorName](this)
}
String.prototype.actionStartColor = function() {
  return chalk.blue(this)
}
String.prototype.actionStopColor = function() {
  return chalk.cyan(this)
}
String.prototype.resultHighlighColor = function() {
  return chalk.yellow(this)
}
String.prototype.resultSecondaryColor = function() {
  return chalk.magenta(this)
}
String.prototype.resultNormalColor = function() {
  return chalk.whiteBright(this)
}
String.prototype.infoColor = function() {
  return chalk.gray(this)
}
String.prototype.errorColor = function() {
  return chalk.redBright(this)
}

const debug = d('command:base')

export default abstract class extends Command {
  static flags = {
    help: flags.help({ char: 'h' }),
    notify: flags.boolean({
      char: 'N',
      description: 'show a notification box when build is completed.',
      default: false
    }),
    path: flags.string({
      char: 'p',
      default: '.',
      description: 'Path where root of project files are'
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
      this._git = simplegit(this.configInstance.projectRootPath)
    }
    return this._git
  }

  private _context: Context | undefined
  public get context(): Context {
    return this._context as Context
  }

  async init() {
    debug('Base init')
    const { flags } = this.parse(this.constructor as any)
    const dir = path.join(flags.path as string)
    this._configInstance = new Config(dir)
    this._context = new Context(this.configInstance)
  }

  async catch(err: Error) {
    this.error(err.toString().errorColor())
    this.exit(1)
  }

  async finally() {
    debug(`Base Finally`)
    const { flags } = this.parse(this.constructor as any)
    if (flags.notify) {
      notifier.notify({
        title: 'Spix Novel Builder',
        message: `Task completed for ${this.configInstance.config.projectTitle}`,
        sound: true
      })
    }
  }

  public async addDigitsToNecessaryStacks(): Promise<boolean> {
    let didAddDigits = false
    await this.context.getAllNovelFiles(true)
    for (const b of [true, false]) {
      const maxDigits = this.context.getMaxNecessaryDigits(b)
      const minDigits = this.context.getMinDigits(b)
      if (minDigits < maxDigits) {
        didAddDigits = didAddDigits || (await this.addDigitsToFiles(await this.context.getAllFilesForOneType(b, true), maxDigits, b))
      }
    }
    return didAddDigits
  }

  public async compactFileNumbers(): Promise<void> {
    cli.action.start('Compacting file numbers'.actionStartColor())

    const table = this.tableize('from', 'to')
    const moves: { fromFilename: string; toFilename: string }[] = []
    const movePromises: Promise<MoveSummary>[] = []
    const { tempDir, removeTempDir } = await this.getTempDir()
    const tempDirForGit = this.context.mapFileToBeRelativeToRootPath(tempDir)

    for (const b of [true, false]) {
      const wildcards = [this.configInstance.chapterWildcard(b), this.configInstance.metadataWildcard(b), this.configInstance.summaryWildcard(b)]
      for (const wildcard of wildcards) {
        const files = await globPromise(path.join(this.configInstance.projectRootPath, wildcard))

        const organizedFiles: any[] = []
        for (const file of files) {
          organizedFiles.push({ number: this.context.extractNumber(file), filename: file })
        }

        const destDigits = this.context.getMaxNecessaryDigits(b)
        let currentNumber = this.configInstance.config.numberingInitial

        for (const file of organizedFiles.sort((a, b) => a.number - b.number)) {
          const fromFilename = this.context.mapFileToBeRelativeToRootPath(file.filename)
          const toFilename = this.context.mapFileToBeRelativeToRootPath(
            path.join(path.dirname(file.filename), this.context.renumberedFilename(file.filename, currentNumber, destDigits, b))
          )

          if (fromFilename !== toFilename) {
            debug(`from: ${fromFilename} to: ${path.join(tempDirForGit, toFilename)}`)
            moves.push({ fromFilename, toFilename })
            table.accumulator(fromFilename, toFilename)
            movePromises.push(this.git.mv(fromFilename, path.join(tempDirForGit, toFilename)))
          }
          currentNumber += this.configInstance.config.numberingStep
        }
      }
    }

    await Promise.all(movePromises)
    for (const renumbering of moves) {
      debug(`from: ${path.join(tempDirForGit, renumbering.toFilename)} to: ${renumbering.toFilename}`)
      movePromises.push(this.git.mv(path.join(tempDirForGit, renumbering.toFilename), renumbering.toFilename))
    }
    await Promise.all(movePromises)

    await removeTempDir()

    if (moves.length === 0) {
      cli.action.stop(`no compacting was needed`.actionStopColor())
    } else {
      cli.action.stop(`done:`.actionStopColor())
      debug
      table.show()
    }
  }

  public async getTempDir(): Promise<{ tempDir: string; removeTempDir(): Promise<void> }> {
    let tempDir = ''
    try {
      const tempPrefix = 'temp'
      tempDir = await mkdtemp(path.join(this.configInstance.projectRootPath, tempPrefix))
      debug(`Created temp dir: ${tempDir}`)
    } catch (err) {
      cli.error(err.errorColor())
      cli.exit(1)
    }

    const removeTempDir = async function() {
      try {
        debug(`Deleting temp dir: ${tempDir}`)
        await deleteDir(tempDir)
      } catch (err) {
        cli.error(err.errorColor())
        cli.exit(1)
      }
    }

    return { tempDir, removeTempDir }
  }

  public tableize(col1: string, col2: string) {
    const moves: { from: string; to: string }[] = []
    const accumulator = function(from: string, to: string) {
      moves.push({ from, to })
    }
    const accumulatorArray = function(arr: { from: string; to: string }[]) {
      for (const line of arr) {
        accumulator(line.from, line.to)
      }
    }

    const show = () => {
      if (moves.length > 0) {
        cli.table(moves.map(o => ({ from: o.from.resultNormalColor(), to: o.to.resultHighlighColor() })), {
          from: {
            header: col1.infoColor(),
            minWidth: 30
          },
          ' ->': {
            get: () => ''
          },
          to: {
            header: col2.infoColor()
          }
        })
      }
    }

    const returnObj = { accumulator, show, accumulatorArray }
    return returnObj
  }

  private async addDigitsToFiles(files: string[], newDigitNumber: number, atNumberingStack: boolean): Promise<boolean> {
    const promises: Promise<MoveSummary>[] = []
    let hasMadeChanges = false
    const table = this.tableize('from', 'to')

    for (const file of files) {
      const filename = path.basename(file)
      const atNumbering = this.configInstance.isAtNumbering(filename)

      if (atNumbering === atNumberingStack) {
        const filenumber = this.context.extractNumber(file)
        const fromFilename = this.context.mapFileToBeRelativeToRootPath(path.join(path.dirname(file), filename))
        const toFilename = this.context.mapFileToBeRelativeToRootPath(
          path.join(path.dirname(file), this.context.renumberedFilename(filename, filenumber, newDigitNumber, atNumbering))
        )
        if (fromFilename !== toFilename) {
          // this.log(`renaming with new file number "${fromFilename}" to "${toFilename}"`.infoColor())
          table.accumulator(fromFilename, toFilename)
          promises.push(this.git.mv(fromFilename, toFilename))
          hasMadeChanges = true
        }
      }
    }

    table.show()
    await Promise.all(promises)
    return hasMadeChanges
  }
}

export const numDigits = function(x: number, buffer = 2) {
  return Math.max(Math.floor(Math.log10(Math.abs(x + buffer))), 0) + 1
}

export const stringifyNumber = function(x: number, digits: number): string {
  const s = x.toString()
  const zeroes = Math.max(digits - s.length, 0)
  if (zeroes > 0) {
    return '0'.repeat(zeroes).concat(s)
  } else {
    return s
  }
}

export const sanitizeFileName = function(original: string): string {
  const sanitized = sanitize(original)
  const latinized = latinize(sanitized)
  return latinized
}

const sanitize_url = require('@braintree/sanitize-url').sanitizeUrl
export const sanitizeUrl = function(original: string): string {
  const sanitized = sanitize_url(original)
  if (sanitized === 'about:blank') {
    return ''
  }
  return sanitized
}
