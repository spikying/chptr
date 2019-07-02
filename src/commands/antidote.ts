
// import { flags } from '@oclif/command'
import { exec } from 'child_process';
import { cli } from 'cli-ux';
// import * as d from 'debug';
// import * as fs from 'fs';
import * as glob from "glob";
import * as path from "path";

import { QueryBuilder } from '../queries';

import { copyFile, d, moveFile, readFile, writeFile } from './base';
import Command from "./edit-save-base"
import Save from './save';
// import { promisify } from "util";

const debug = d('command:antidote')

export default class Antidote extends Command {
  static description = 'Launch Antidote spell-checker'

  static flags = {
    ...Command.flags
  }

  static args = [{
    name: 'filter',
    description: 'Chapter number to Antidote.',
    required: false,
    default: ''
  }]

  async run() {
    const { args, flags } = this.parse(Antidote)

    let filter = args.filter
    if (filter === '') {
      const queryBuilder = new QueryBuilder()
      queryBuilder.add('filter', queryBuilder.textinput("What chapter to Antidote?", ""))
      const queryResponses: any = await queryBuilder.responses()
      filter = queryResponses.filter
    }
    const chapterNumber = parseInt(filter, 10)
    const chapterFileName = glob.sync(path.join(this.configInstance.projectRootPath, this.configInstance.chapterWildcardWithNumber(chapterNumber)))[0]

    const basicFilePath = path.join(this.configInstance.projectRootPath, chapterFileName)
    //TODO: get antidote filename from config pattern
    const antidoteFilePath = path.join(this.configInstance.projectRootPath, chapterFileName.replace(/\.md$/, '.antidote'))
    debug(`antidoteFilePath=${antidoteFilePath}`)

    cli.action.start(`Launching Antidote with ${antidoteFilePath}`)
    await copyFile(basicFilePath, antidoteFilePath)
    await this.turnToUTF8BOM(antidoteFilePath)
    await this.processFileBack(antidoteFilePath)
    await this.processFile(antidoteFilePath)
    await this.processFileForAntidote(antidoteFilePath)


    const filePath = `"${path.resolve(antidoteFilePath)}"`
    debug(`filePath = ${filePath}`)

    void this.runAntidote([filePath])

    cli.action.stop('done')
    await cli.anykey('Press any key when Antidote correction is done to continue.')

    const queryBuilder2 = new QueryBuilder()
    queryBuilder2.add('message', queryBuilder2.textinput("Message to use in commit to repository? Type `cancel` to skip commit step.", ""))
    const queryResponses2: any = await queryBuilder2.responses()
    const message = (queryResponses2.message + '\nPost-Antidote').replace(/"/, '`')

    await this.processFileBackFromAntidote(antidoteFilePath)
    await this.processFileBack(antidoteFilePath)
    await this.processFile(antidoteFilePath)
    await moveFile(antidoteFilePath, basicFilePath)

    if (message !== 'cancel') {
      await Save.run([`--path=${flags.path}`, '-f', chapterNumber.toString(), message])
    }

  }

  private async runAntidote(options: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = 'antidote ' + options.join(' ')
      debug(`before executing child process with command ${command} `)
      const cp = exec(command, (err, pout, perr) => {
        debug('finished child process')
        if (err) {
          this.error(err)
          reject(err)
        }
        if (perr) {
          this.error(perr)
          reject(perr)
        }
        if (pout) {
          this.log(pout)
        }
        resolve()
      })
      cp.on("close", (code, signal) => {
        debug(`code = ${code} signal = ${signal} `)
      })
    })
  }

  private async processFileForAntidote(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)

      const re = new RegExp(this.sentenceBreakChar + '\r?\n', 'gm')
      const replacedContent = initialContent.replace(re, this.sentenceBreakChar + '  ')
        .replace(/\n/gm, '\r\n')
      debug(`Processed antidote content: \n${replacedContent.substring(0, 250)}`)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
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
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)

      const sentenceRE = new RegExp(this.sentenceBreakChar + '  ', 'gm')
      const paragraphRE = new RegExp('(' + this.paragraphBreakChar + "{{\\d+}}\\n)\\n", 'gm')
      const replacedContent = this.removeTripleEnters(
        initialContent
          .replace(sentenceRE, this.sentenceBreakChar + '\n')
          .replace(/\r\n/gm, '\n\n')
          .replace(/^\uFEFF\n\n# /g, '\n# ') // un-BOM the file
          .replace(paragraphRE, '$1')
          .replace(/([.!?…"])$/, '$1\n'))
      debug(`Processed back antidote content: \n${replacedContent.substring(0, 250)}`)
      debug(`replace2\n${paragraphRE}\n${paragraphRE.test(replacedContent)}`)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

  private async turnToUTF8BOM(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)

      if (initialContent.charCodeAt(0) !== 65279) {
        const replacedContent = String.fromCharCode(65279) + initialContent
        debug(`To BOM: ${replacedContent.substring(0, 5)}`)
        await writeFile(filepath, replacedContent, 'utf8')
      }
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }


}
