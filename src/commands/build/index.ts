import { flags } from '@oclif/command'
import { Input } from '@oclif/parser'
import { exec } from 'child_process'
import cli from 'cli-ux'
import yaml = require('js-yaml')
import * as path from 'path'
import { file as tmpFile } from 'tmp-promise'

import { BootstrapChptr } from '../../bootstrap-functions'
import { ChapterId } from '../../chapter-id'
import { ChptrError } from '../../chptr-error'
import { QueryBuilder } from '../../ui-utils'
import { d } from '../base'

import Command from './metadata'

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
    outputToProd: flags.boolean({
      char: 'p',
      description: 'Remove paragraph numbers, clean markup in output and remove chapter titles.  When false, adds summaries in output.',
      default: false
    }),
    withFullIntermediaryOutput: flags.boolean({
      char: 'i',
      description: 'With full intermediary output as .md file',
      default: false
    })
  }

  static aliases = ['compile']
  static hidden = false

  async run() {
    debug('Running Build command')

    // const tmpMDfile = await tmpFile()
    // const tmpMDfileTex = await tmpFile()
    // debug(`temp files = ${tmpMDfile.path} and ${tmpMDfileTex.path}`)

    // try {
    const { flags } = this.parse(this.constructor as Input<any>)

    // const removeMarkup = flags.removemarkup
    // const withSummaries = flags.withsummaries
    const outputToProd = flags.outputToProd
    const withIntermediary = flags.withFullIntermediaryOutput

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

    await this.RunMetadata(flags)

    await this.coreUtils.buildOutput(outputToProd, withIntermediary, outputFiletype, this.outputFile)
  }
}
