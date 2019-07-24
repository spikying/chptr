import { exec } from 'child_process'
import { cli } from 'cli-ux'
import * as glob from 'glob'
import * as path from 'path'

import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('command:antidote')

export default class Antidote extends Command {
  static description = 'Launch Antidote spell-checker for given chapter'

  static flags = {
    ...Command.flags
  }

  static args = [
    {
      name: 'filter',
      description: 'Chapter number to Antidote.',
      required: false,
      default: ''
    }
  ]

  static hidden = false

  async run() {
    const { args } = this.parse(Antidote)

    let filter: string = args.filter
    if (filter === '') {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('filter', queryBuilder.textinput('What chapter to Antidote?', ''))
      const queryResponses: any = await queryBuilder.responses()
      filter = queryResponses.filter
    }
    const isAtNumber: boolean = filter.substring(0, 1) === '@'

    const chapterNumber = this.softConfig.extractNumber(filter)
    const chapterFileName = glob.sync(
      path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterNumber, isAtNumber))
    )[0]

    if (!chapterFileName) {
      this.error(`No chapter was found with input ${filter}`.errorColor())
      this.exit(1)
    }

    const basicFilePath = path.join(this.rootPath, chapterFileName)
    const antidoteFilePath = this.hardConfig.antidotePathName(chapterFileName)

    cli.action.start(`Launching Antidote with ${antidoteFilePath}`.actionStartColor())
    await this.fsUtils.copyFile(basicFilePath, antidoteFilePath)
    await this.processUTF8BOMandContent(antidoteFilePath)
    // await this.processFileBack(antidoteFilePath)
    // await this.processFile(antidoteFilePath)
    // await this.processFileForAntidote(antidoteFilePath)

    const filePath = `"${path.resolve(antidoteFilePath)}"`

    void this.runAntidote([filePath])

    cli.action.stop('done'.actionStopColor())
    await cli.anykey('Press any key when Antidote correction is done to continue.'.resultHighlighColor())

    const queryBuilder2 = new QueryBuilder()
    queryBuilder2.add('message', queryBuilder2.textinput('Message to use in commit to repository? Type `cancel` to skip commit step.', ''))
    const queryResponses2: any = await queryBuilder2.responses()
    const message = (queryResponses2.message + '\nPost-Antidote').replace(/"/, '`')

    await this.processFileBackFromAntidote(antidoteFilePath)
    // await this.processFileBack(antidoteFilePath)
    // await this.processFile(antidoteFilePath)
    await this.fsUtils.moveFile(antidoteFilePath, basicFilePath)

    if (queryResponses2.message !== 'cancel') {
      const toStageFiles = await this.GetGitListOfStageableFiles(chapterNumber, isAtNumber)
      await this.CommitToGit(message, toStageFiles)
    }
  }

  private async runAntidote(options: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = 'antidote ' + options.join(' ')
      debug(`Executing child process with command ${command} `)

      exec(command, (err, pout, perr) => {
        if (err) {
          this.error(err.toString().errorColor())
          reject(err)
        }
        if (perr) {
          this.error(perr.toString().errorColor())
          reject(perr)
        }
        if (pout) {
          this.log(pout)
        }
        resolve()
      })
    })
  }

  private processContentForAntidote(initialContent: string): string {
    try {
      const re = new RegExp(this.markupUtils.sentenceBreakChar + '\r?\n', 'gm')
      const replacedContent = initialContent.replace(re, this.markupUtils.sentenceBreakChar + '  ').replace(/\n/gm, '\r\n')
      debug(`Processed antidote content: \n${replacedContent.substring(0, 250)}`)

      return replacedContent
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }
    return ''
  }

  private removeTripleEnters(str: string): string {
    const tripleEnterRegEx = /\n\n\n/gm
    if (tripleEnterRegEx.test(str)) {
      return this.removeTripleEnters(str.replace(tripleEnterRegEx, '\n\n'))
    } else {
      return str
    }
  }

  private async processFileBackFromAntidote(filepath: string): Promise<void> {
    try {
      const initialContent = await this.fsUtils.readFileContent(filepath)

      const sentenceRE = new RegExp(this.markupUtils.sentenceBreakChar + '  ', 'gm')
      const paragraphRE = new RegExp('(' + this.markupUtils.paragraphBreakChar + '{{\\d+}}\\n)\\n', 'gm')
      let replacedContent = this.removeTripleEnters(
        initialContent
          .replace(sentenceRE, this.markupUtils.sentenceBreakChar + '\n')
          .replace(/\r\n/gm, '\n\n')
          .replace(/^\uFEFF\n\n# /g, '\n# ') // un-BOM the file
          .replace(paragraphRE, '$1')
          .replace(/([.!?…}"])$/, '$1\n')
      )
      replacedContent = this.processContent(this.processContentBack(replacedContent))

      debug(`Processed back antidote content: \n${replacedContent.substring(0, 250)}`)
      await this.fsUtils.writeFile(filepath, replacedContent)
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }
  }

  private async processUTF8BOMandContent(filepath: string): Promise<void> {
    try {
      const initialContent = await this.fsUtils.readFileContent(filepath)

      let replacedContent = initialContent
      if (initialContent.charCodeAt(0) !== 65279) {
        replacedContent = String.fromCharCode(65279) + initialContent
      }

      replacedContent = await this.processContentForAntidote(this.processContent(this.processContentBack(replacedContent)))

      await this.fsUtils.writeFile(filepath, replacedContent)
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    }
  }
}
