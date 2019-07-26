import { exec } from 'child_process'
import { cli } from 'cli-ux'
import * as path from 'path'

import { ChapterId } from '../chapter-id'
import { ChptrError } from '../chptr-error'
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
      name: 'chapterId',
      description: 'Chapter number to Antidote.',
      required: false,
      default: ''
    }
  ]

  static hidden = false

  async run() {
    const { args } = this.parse(Antidote)

    let chapterIdString: string = args.chapterId
    if (chapterIdString === '') {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('chapterId', queryBuilder.textinput('What chapter to Antidote?', ''))
      const queryResponses: any = await queryBuilder.responses()
      chapterIdString = queryResponses.chapterId
    }
    const chapterId = new ChapterId(this.softConfig.extractNumber(chapterIdString), this.softConfig.isAtNumbering(chapterIdString))

    const chapterFileName = (await this.fsUtils.listFiles(path.join(this.rootPath, this.softConfig.chapterWildcardWithNumber(chapterId))))[0]

    if (!chapterFileName) {
      throw new ChptrError(`No chapter was found with id ${chapterIdString}`, 'antidote:run', 2)
    }

    const basicFilePath = path.join(this.rootPath, chapterFileName)
    const antidoteFilePath = this.hardConfig.antidotePathName(chapterFileName)

    cli.action.start(`Launching Antidote with ${antidoteFilePath}`.actionStartColor())
    await this.fsUtils.copyFile(basicFilePath, antidoteFilePath)
    await this.processPreAntidote(antidoteFilePath)

    const filePath = `"${path.resolve(antidoteFilePath)}"`

    void this.runAntidote([filePath])

    cli.action.stop('done'.actionStopColor())
    await cli.anykey('Press any key when Antidote correction is done to continue.'.resultHighlighColor())

    await this.processPostAntidote(antidoteFilePath)

    const queryBuilder2 = new QueryBuilder()
    queryBuilder2.add('message', queryBuilder2.textinput('Message to use in commit to repository? Type `cancel` to skip commit step.', ''))
    const queryResponses2: any = await queryBuilder2.responses()
    const message = ('Antidote:\n' + queryResponses2.message).replace(/"/, '`')

    await this.fsUtils.moveFile(antidoteFilePath, basicFilePath)

    if (queryResponses2.message !== 'cancel') {
      const toStageFiles = await this.GetGitListOfStageableFiles(chapterId)
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

  private removeTripleEnters(str: string): string {
    const tripleEnterRegEx = /\n\n\n/gm
    if (tripleEnterRegEx.test(str)) {
      return this.removeTripleEnters(str.replace(tripleEnterRegEx, '\n\n'))
    } else {
      return str
    }
  }

  private async processPostAntidote(filepath: string): Promise<void> {
    const initialContent = await this.fsUtils.readFileContent(filepath)

    let replacedContent = this.removeTripleEnters(
      ('\n' + initialContent) // enter at the beginning
        .replace(/\n/gm, '\r\n')
        .replace(/\r\n/gm, '\n\n')
        .concat('\n') // add an enter at the end
        .replace(/\n{2,}$/, '\n') // make sure there is only one enter at the end
        .replace(/^\n{2,}# /, '\n# ') // make sure there is an enter before the first line
    )
    replacedContent = this.processContent(this.processContentBack(replacedContent))

    debug(`Processed back antidote content: \n${replacedContent.substring(0, 250)}`)
    await this.fsUtils.writeFile(filepath, replacedContent)
  }

  private async processPreAntidote(filepath: string): Promise<void> {
    const initialContent = await this.fsUtils.readFileContent(filepath)

    let replacedContent = initialContent
    if (initialContent.charCodeAt(0) !== 65279) {
      replacedContent = String.fromCharCode(65279) + initialContent
    }

    replacedContent = this.processContentBack(replacedContent)

    await this.fsUtils.writeFile(filepath, replacedContent)
  }
}
