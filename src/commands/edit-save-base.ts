import { flags } from '@oclif/command'
import * as d from 'debug';
import * as fs from 'fs';
import * as path from "path";
import { promisify } from "util";

import { filterNumbers } from '../helpers';

import Command from "./base";

const debug = d('command:edit-save-base')

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

export default abstract class extends Command {

  static flags = {
    ...Command.flags
  }

  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  private readonly sentenceBreakChar = '\u200D'// '\u000D' // '\u2028'

  public async processFile(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)
      let paraCounter = 1
      // \u2028 = line sep  \u200D = zero width joiner
      const replacedContent = initialContent.replace(/([.!?…"]) {2}([A-ZÀ-Ú])/gm, '$1' + this.sentenceBreakChar + '\n$2')
        .replace(/([.!?…"])\n{2}([A-ZÀ-Ú])/gm, (full, one, two) => {
          paraCounter++
          // return `$1\u2029\n\n$2{{${paraCounter}}}`
          debug(`full: ${full} one: ${one} two: ${two}`)
          return `${one}\n\n\u2029{{${paraCounter}}}\n${two}`
        })
      debug(`Processed content: \n${replacedContent.substring(0, 250)}`)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

  public async processFileBack(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)
      const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\n', 'gm')
      const replacedContent = initialContent.replace(sentenceBreakRegex, '  ')
        .replace(/\n\n\u2029{{\d+}}\n/gm, '\n\n')
      debug(`Processed back content: \n${replacedContent.substring(0, 250)}`)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

}
