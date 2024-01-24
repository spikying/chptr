import { Flags } from '@oclif/core'

import { BuildType, CoreUtils } from '../../shared/core-utils'
import { QueryBuilder } from '../../shared/ui-utils'
import BaseCommand, { d } from '../base'
import { Container } from 'typescript-ioc'
import MetadataExecutor from '../../shared/metadata-executor'
import { metadataFlags } from './metadata'

const debug = d('build')

export default class Build extends BaseCommand<typeof Build> {
  static aliases = ['compile']
  static readonly exportableFileTypes = ['md', 'pdf', 'docx', 'html', 'epub', 'tex']
  static description = `Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: ${Build.exportableFileTypes.join(
    ', '
  )}.  Gives some insight into writing rate.`

  static flags = {
    ...metadataFlags,
    outputToPreProd: Flags.boolean({
      char: 'D',
      default: false,
      description: 'Keep paragraph numbers, but clean markup as if doing an output to Prod.',
      exclusive: ['outputToeProd']
    }),
    // removemarkup: flags.boolean({
    //   char: 'r',
    //   description: 'Remove paragraph numbers and clean markup in output',
    //   default: false
    // }),
    // withsummaries: flags.boolean({
    //   char: 'S',
    //   description: 'Add summaries in output, before actual content',
    //   default: false
    // }),
    outputToProd: Flags.boolean({
      char: 'P',
      default: false,
      description: 'Remove paragraph numbers, clean markup in output and remove chapter titles.  When false, adds summaries in output.',
      exclusive: ['outputToPreProd']
    }),
    type: Flags.string({
      char: 't',
      description: 'filetype to export to.  Can be set multiple times.',
      multiple: true,
      options: [...Build.exportableFileTypes, 'all']
    }),
    withFullIntermediaryOutput: Flags.boolean({
      char: 'i',
      default: false,
      description: 'With full intermediary output as .md file'
    })
  }

  static hidden = false

  public async run() {
    debug('Running Build command')

    // const { flags } = await this.parse({
    //   args: this.ctor.args,
    //   baseFlags: (super.ctor as typeof Build).baseFlags,
    //   enableJsonFlag: this.ctor.enableJsonFlag,
    //   flags: this.ctor.flags,
    //   strict: this.ctor.strict
    // })

    // const removeMarkup = flags.removemarkup
    // const withSummaries = flags.withsummaries
    const { outputToProd } = this.flags
    const { outputToPreProd } = this.flags
    const withIntermediary = this.flags.withFullIntermediaryOutput

    let outputFiletype = this.flags.type
    if (!outputFiletype) {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('type', queryBuilder.checkboxinput(Build.exportableFileTypes, 'Which filetype(s) to output?', ['md']))
      const queryResponses: any = await queryBuilder.responses()
      outputFiletype = queryResponses.type
    }

    if (outputFiletype!.includes('all')) {
      outputFiletype = Build.exportableFileTypes
    }

    const executor = Container.get(MetadataExecutor)
    await executor.RunMetadata(this.flags)

    let buildType: BuildType = BuildType.dev
    if (outputToProd) {
      buildType = BuildType.prod
    } else if (outputToPreProd) {
      buildType = BuildType.preProd
    }

    const coreUtils = Container.get(CoreUtils)
    await coreUtils.buildOutput(buildType, withIntermediary, outputFiletype, executor.GetOutputFile(this.flags))
  }
}
