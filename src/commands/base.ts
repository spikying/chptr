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
import { promisify } from 'util'

import { HardConfig } from '../config'

export const readFile = promisify(fs.readFile)
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
export const writeFile = async function(path: string, data: string) {
  const wf = promisify(fs.writeFile)
  return wf(path, data, 'utf8')
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
  public get git(): simplegit.SimpleGit {
    if (!this._git) {
      this._git = simplegit(this._rootPath)
    }
    return this._git  }
  public get hardConfig(): HardConfig {
    return this._hardConfig as HardConfig
  }

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

  private _rootPath =''
  private _git: simplegit.SimpleGit | undefined
  private _hardConfig: HardConfig | undefined

  async init() {
    debug('Base init')
    const { flags } = this.parse(this.constructor as any)
    const dir = path.join(flags.path as string)
    this._rootPath = dir
    this._hardConfig = new HardConfig(dir)
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
        title: 'Chptr',
        message: `Task completed for command ${this.constructor.toString()}`,
        sound: true
      })
    }
  }

  public async getTempDir(): Promise<{ tempDir: string; removeTempDir(): Promise<void> }> {
    let tempDir = ''
    try {
      const tempPrefix = 'temp'
      tempDir = await mkdtemp(path.join(this._rootPath, tempPrefix))
      debug(`Created temp dir: ${tempDir}`)
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    const removeTempDir = async function() {
      try {
        debug(`Deleting temp dir: ${tempDir}`)
        await deleteDir(tempDir)
      } catch (err) {
        cli.error(err.toString().errorColor())
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

  public async createFile(fullPathName: string, content: string) {
    const directoryPath = path.dirname(fullPathName)
    const directoryExists = await fileExists(directoryPath)
    if (!directoryExists) {
      try {
        await createDir(directoryPath)
      } catch {}
    }

    const createFile = promisify(fs.writeFile)
    try {
      await createFile(fullPathName, content, { encoding: 'utf8' })
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    } finally {
      cli.info(`Created ${fullPathName.resultHighlighColor()}`.resultNormalColor())
    }
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

export const sanitizeFileName = function(original: string, keepFolders = false): string {
  if (keepFolders) {
    original = original.replace(/[\/\\]/g, '\u2029')
  }
  const sanitized = sanitize(original).replace(/\u2029/g, path.sep)
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
