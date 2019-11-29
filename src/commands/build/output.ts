import { flags } from '@oclif/command'
import { Input } from '@oclif/parser'
import { QueryBuilder } from '../../ui-utils'
import { d } from '../base'
import * as moment from 'moment'

import Command from './metadata' // '../compactable-base'

const debug = d('build')

export default class Build extends Command {
  static readonly exportableFileTypes = ['md', 'pdf', 'docx', 'html', 'epub', 'tex']

  static description = `Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: ${Build.exportableFileTypes.join(
    ', '
  )}.  Gives some insight into writing rate.`

  static flags = {
    ...Command.flags,
    type: flags.string({
      char: 't',
      description: 'filetype to export to.  Can be set multiple times.',
      options: Build.exportableFileTypes.concat('all'),
      default: '',
      multiple: true
    }),
    removemarkup: flags.boolean({
      char: 'r',
      description: 'Remove paragraph numbers and clean markup in output',
      default: false
    }),
    withsummaries: flags.boolean({
      char: 'S',
      description: 'Add summaries in output, before actual content',
      default: false
    })
  }

  static aliases = ['compile']
  static hidden = false

  //TODO: make inherit from metadata, and copy inheritance pattern from metadata, to remove code duplication between here and index.ts
  async run() {
    debug('Running Build:output command')
    const { flags } = this.parse(this.constructor as Input<any>)

    const removeMarkup = flags.removemarkup
    const withSummaries = flags.withsummaries

    let outputFiletype = flags.type
    if (!outputFiletype) {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('type', queryBuilder.checkboxinput(Build.exportableFileTypes, 'Which filetype(s) to output?', ['md']))
      const queryResponses: any = await queryBuilder.responses()
      outputFiletype = queryResponses.type
    }
    if (outputFiletype.indexOf('all') >= 0) {
      outputFiletype = Build.exportableFileTypes
    }

    // const outputFile = `${flags.datetimestamp ? moment().format('YYYYMMDD.HHmm ') : ''}${this.fsUtils.sanitizeFileName(
    //   this.softConfig.config.projectTitle
    // )}`

    await this.coreUtils.buildOutput(removeMarkup, withSummaries, outputFiletype, this.outputFile)
  }
}
