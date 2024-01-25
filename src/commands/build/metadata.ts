import { Flags } from '@oclif/core'
import { SoftConfig } from '../../shared/soft-config'
import BaseCommand, { d } from '../base'
// import Command from '../compactable-base'
import { Container } from 'typescript-ioc'
import { compact } from '../../flags/compact-flag'
import { FsUtils } from '../../shared/fs-utils'
import MetadataExecutor from '../../shared/metadata-executor'

const debug = d('build:metadata')

export const metadataFlags = {
  compact: compact,
  datetimestamp: Flags.boolean({
    char: 'd',
    default: false,
    description: 'adds datetime stamp before output filename'
  }),
  save: Flags.boolean({
    char: 's',
    default: false,
    description: 'Commit to git at the same time.'
  }),
  showWritingRate: Flags.string({
    char: 'w',
    default: 'yes',
    description: 'Show word count per day.  Overwrite option recalculates it all from scratch.',
    options: ['yes', 'no', 'overwrite']
  })
}
export default class Metadata extends BaseCommand<typeof Metadata> {
  static description = `Updates only metadata files`

  static flags = { ...metadataFlags }

  static hidden = false

  private readonly fsUtils: FsUtils = Container.get(FsUtils)
  private readonly softConfig: SoftConfig = Container.get(SoftConfig)

  async init() {
    debug('init of  Build:metadata')
    await super.init()

    const { flags } = await this.parse({
      args: this.ctor.args,
      baseFlags: (super.ctor as typeof Metadata).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict
    })
  }

  async run() {
    debug('Running Build:metadata command')
    const { flags } = await this.parse({
      args: this.ctor.args,
      baseFlags: (super.ctor as typeof Metadata).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict
    })

    const executor = Container.get(MetadataExecutor)
    await executor.RunMetadata(flags)
  }
}
