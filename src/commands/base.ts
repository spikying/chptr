import { Command, flags } from '@oclif/command'
import * as deb from 'debug'
import * as notifier from 'node-notifier'
import * as path from 'path'
// import * as simplegit from 'simple-git/promise'

import { FsUtils } from '../fs-utils'
import { HardConfig } from '../hard-config'
// import { promisify } from 'util'
import '../ui-utils'
import { Container, Scope, Provider } from 'typescript-ioc'

export const d = (cmdName: string) => {
  return deb(`chptr:${cmdName}`)
}

// const chalk: any = require('chalk')
// String.prototype.color = function(colorName: string) {
//   return chalk[colorName](this)
// }
// String.prototype.actionStartColor = function() {
//   return chalk.blue(this)
// }
// String.prototype.actionStopColor = function() {
//   return chalk.cyan(this)
// }
// String.prototype.resultHighlighColor = function() {
//   return chalk.yellow(this)
// }
// String.prototype.resultSecondaryColor = function() {
//   return chalk.magenta(this)
// }
// String.prototype.resultNormalColor = function() {
//   return chalk.whiteBright(this)
// }
// String.prototype.infoColor = function() {
//   return chalk.gray(this)
// }
// String.prototype.errorColor = function() {
//   return chalk.redBright(this)
// }

const debug = d('command:base')

export default abstract class extends Command {
  public get hardConfig(): HardConfig {
    return this._hardConfig as HardConfig
  }
  public get fsUtils(): FsUtils {
    return this._fsUtils as FsUtils
  }

  static flags = {
    help: flags.help({ char: 'h' }),
    notify: flags.boolean({
      char: 'N',
      description: 'show a notification box when command is completed.',
      default: false
    }),
    path: flags.string({
      char: 'p',
      default: '.',
      description: 'Path where root of project files are'
    })
  }
  static hidden = true

  public get rootPath(): string {
    return this._rootPath
  }

  private _rootPath = '.'
  // private _git: simplegit.SimpleGit | undefined
  private _hardConfig: HardConfig | undefined
  private _fsUtils: FsUtils | undefined

  async init() {
    debug('Base init')
    const { flags } = this.parse(this.constructor as any)
    const dir = path.join(flags.path as string)
    this._rootPath = dir

    const hardConfigProvider: Provider = {
      get: () => {
        return new HardConfig(dir)
      }
    }
    Container.bind(HardConfig)
      .provider(hardConfigProvider)
      .scope(Scope.Singleton)

    this._hardConfig = Container.get(HardConfig) //new HardConfig(dir)

    this._fsUtils = new FsUtils()
  }

  async catch(err: Error) {
    // throw new ChptrError(err.toString().errorColor())
    this.error(err.toString())
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
}
