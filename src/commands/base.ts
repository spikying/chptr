import { Args, Command, Flags, Interfaces } from '@oclif/core'
import * as path from 'node:path'
import * as notifier from 'node-notifier'
import { Container, ObjectFactory, Scope } from 'typescript-ioc'

import { FsUtils } from '../shared/fs-utils'
import { HardConfig } from '../shared/hard-config'
import { SoftConfig } from '../shared/soft-config'
import { simpleGit } from 'simple-git'
import { CoreUtils } from '../shared/core-utils'
import { BootstrapChptr } from '../shared/bootstrap-functions'
import WatchConfig from '../shared/watch-config'

export const d = (cmdName: string) => require('debug')(`chptr:${cmdName}`)

const debug = d('command:base')

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<(typeof BaseCommand)['baseFlags'] & T['flags']>
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

export default abstract class BaseCommand<T extends typeof Command> extends Command {
  static baseFlags = {
    help: Flags.help({ char: 'h' }),
    notify: Flags.boolean({
      char: 'N',
      default: false,
      description: 'show a notification box when command is completed.'
    }),
    path: Flags.string({
      char: 'p',
      default: '.',
      description: 'Path where root of project files are'
    })
  }

  protected flags!: Flags<T>
  protected args!: Args<T>

  static hidden = true

  async catch(err: Error) {
    this.error(err.toString(), {exit: 1})
  }

  async finally(_: Error | undefined) {
    debug(`Base Finally`)
    // const { flags } = this.parse(this.constructor as any) as any
    if (this.flags.notify) {
      notifier.notify({
        message: `Task completed for command ${this.constructor.toString()}`,
        sound: true,
        title: 'Chptr'
      })
    }

    if (this.flags.compact) {
      const coreUtils = Container.get(CoreUtils)
      await coreUtils.compactFileNumbers()
      await coreUtils.preProcessAndCommitFiles('Compacted file numbers')
    }
    return super.finally(_)
  }

  async init(): Promise<void> {
    debug('Base init')

    const { args, flags } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      args: this.ctor.args,
      strict: this.ctor.strict
    })
    this.flags = flags as Flags<T>
    this.args = args as Args<T>

    const rootPath = path.join(flags.path as string)

    Container.bindName('rootPath').to(rootPath)

    const softConfigFactory: ObjectFactory = () => new SoftConfig()
    Container.bind(SoftConfig).factory(softConfigFactory).scope(Scope.Singleton)

    const hardConfigFactory: ObjectFactory = () => new HardConfig(rootPath)
    Container.bind(HardConfig).factory(hardConfigFactory).scope(Scope.Singleton)

    Container.bindName('git').to(simpleGit(rootPath))

    const bootstrapper = Container.get(BootstrapChptr)
    const isChptrFolder = await bootstrapper.isChptrFolder()

    if (isChptrFolder) {
      const watchConfig = Container.get(WatchConfig)
      await watchConfig.RenameFilesIfNewPattern()
      await watchConfig.MoveToNewBuildDirectory()
      await watchConfig.RenameProjectTitle()
      await watchConfig.CheckIfStepOrInitialNumberHaveChanged()

      const fsUtils = Container.get(FsUtils)
      await fsUtils.deleteEmptySubDirectories(rootPath)
    }

    await super.init()
  }
}
