// import { flags } from '@oclif/command'

// import { filterNumbers } from '../helpers';

import Command, { d, readFile, writeFile } from "./base";

const debug = d('command:edit-save-base')

export default abstract class extends Command {

  static flags = {
    ...Command.flags
  }

  // https://unicode.org/reports/tr29/#Sentence_Boundaries
  public readonly sentenceBreakChar = '\u2028' // '\u000D'// '\u200D' // '\u2028'
  public readonly paragraphBreakChar = '\u2029'

  public async processFile(filepath: string): Promise<void> {
    try {
      debug(`opening filepath: ${filepath}`)
      const buff = await readFile(filepath)
      const initialContent = await buff.toString('utf8', 0, buff.byteLength)
      let paraCounter = 1
      // \u2028 = line sep  \u200D = zero width joiner
      const replacedContent = initialContent.replace(/([.!?…}"]) {2}([{A-ZÀ-Ú])/gm, '$1' + this.sentenceBreakChar + '\n$2')
        .replace(/([.!?…}"])\n{2}([{A-ZÀ-Ú])/gm, (full, one, two) => {
          paraCounter++
          // return `$1\u2029\n\n$2{{${paraCounter}}}`
          debug(`full: ${full} one: ${one} two: ${two}`)
          return `${one}\n\n${this.paragraphBreakChar}{{${paraCounter}}}\n${two}`
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
      const sentenceBreakRegex = new RegExp(this.sentenceBreakChar + '\\n', 'g')
      const paragraphBreakRegex = new RegExp('\\n\\n' + this.paragraphBreakChar + '{{\\d+}}\\n', 'g')

      debug(`sentence RE = ${sentenceBreakRegex} paragraph RE = ${paragraphBreakRegex}`)
      const replacedContent = initialContent.replace(sentenceBreakRegex, '  ')
        .replace(paragraphBreakRegex, '\n\n')
        .replace(/([.!?…}"]) +\n/g, '$1\n')
        .replace(/\n*$/, '\n')
      debug(`Processed back content: \n${replacedContent.substring(0, 250)}`)
      await writeFile(filepath, replacedContent, 'utf8')
    } catch (error) {
      this.error(error)
      this.exit(1)
    }
  }

}
