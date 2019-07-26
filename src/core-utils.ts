import * as path from 'path'

import { FsUtils } from './fs-utils'
import { MarkupUtils } from './markup-utils'
import { SoftConfig } from './soft-config'
import { tableize } from './ui-utils'

export class CoreUtils {
  private readonly softConfig: SoftConfig
  private readonly rootPath: string
  private readonly markupUtils: MarkupUtils
  private readonly fsUtils: FsUtils

  constructor(softConfig: SoftConfig, rootPath: string) {
    this.softConfig = softConfig
    this.rootPath = rootPath
    this.markupUtils = new MarkupUtils(softConfig, rootPath)
    this.fsUtils = new FsUtils()
  }

  //#region project files manipulations
  public processContent(initialContent: string): string {
    let paraCounter = 1
    // \u2028 = line sep  \u200D = zero width joiner
    const replacedContent = this.processContentBack(initialContent)
      .replace(/([.!?…}"]) {2}([{A-ZÀ-Ú])/gm, '$1' + this.markupUtils.sentenceBreakChar + '\n$2')
      .replace(/([.!?…}"])\n{2}([{A-ZÀ-Ú])/gm, (_full, one, two) => {
        paraCounter++
        return `${one}\n\n${this.markupUtils.paragraphBreakChar}{{${paraCounter}}}\n${two}`
      })

    return replacedContent
  }

  public processContentBack(initialContent: string): string {
    const sentenceBreakRegex = new RegExp(this.markupUtils.sentenceBreakChar + '\\n', 'g')
    const paragraphBreakRegex = new RegExp('\\n\\n' + this.markupUtils.paragraphBreakChar + '{{\\d+}}\\n', 'g')

    const replacedContent = initialContent
      .replace(sentenceBreakRegex, '  ')
      .replace(paragraphBreakRegex, '\n\n')
      .replace(/([.!?…}"]) +\n/g, '$1\n')
      .replace(/\n*$/, '\n')

    return replacedContent
  }

  public async processChapterFilesBeforeSaving(toStageFiles: string[]): Promise<void> {
    // cli.info('Processing files to repository format:'.infoColor())
    const table = tableize('', 'file')
    for (const filename of toStageFiles) {
      const fullPath = path.join(this.rootPath, filename)
      const exists = await this.fsUtils.fileExists(fullPath)

      if (
        exists &&
        (this.softConfig.chapterRegex(false).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.softConfig.chapterRegex(true).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.softConfig.summaryRegex(false).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)) ||
          this.softConfig.summaryRegex(true).test(this.softConfig.mapFileToBeRelativeToRootPath(fullPath)))
      ) {
        const initialContent = await this.fsUtils.readFileContent(fullPath)
        const replacedContent = this.processContent(this.processContentBack(initialContent))
        if (initialContent !== replacedContent) {
          await this.fsUtils.writeFile(fullPath, replacedContent)
          table.accumulator('', fullPath)
          // cli.info(`    ${fullPath}`.resultHighlighColor())
        }
      }
    }
    table.show('Processing files to repository format')
  }
  //#end region
}
