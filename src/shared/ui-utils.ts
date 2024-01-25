import { ux } from '@oclif/core'
import { FsUtils } from './fs-utils'
import { actionStartColor, actionStopColor, infoColor, normalColor, resultHighlighColor, resultNormalColor } from './colorize'

const debug = require('debug')('ui-utils')

export class QueryBuilder {
  private readonly allQueries: object[] = []
  private readonly fsUtils: FsUtils
  private readonly fuzzy: boolean = false

  constructor(withFuzzyPath = false) {
    debug(`New QueryBuilder instance`)
    this.fuzzy = withFuzzyPath
    this.fsUtils = new FsUtils()
  }

  public add(name: string, params: object) {
    const obj = { name, ...params }
    this.allQueries.push(obj)
  }

  public checkboxinput(choices: string[], msg?: string, defaultValue?: string[]): object {
    const obj = {
      choices,
      default: defaultValue,
      message: msg || 'Choose one or more values',
      type: 'checkbox'
    }
    return obj
  }

  public filename(msg?: string, defaultValue?: string): object {
    const obj = {
      default: defaultValue || 'chapter',
      filter: this.fsUtils.sanitizeFileName,
      message: msg || 'What name do you want as a filename?',
      type: 'input'
    }
    return obj
  }

  public fuzzyFilename(rootPath: string, excludePath: (file: string) => boolean, msg?: string): object {
    // debug(`fuzzy: ${excludePath.toString()}`)
    const obj = {
      default: '',
      // name: 'path',
      excludePath, // nodePath => nodePath.startsWith('node_modules'),
      // excludePath :: (String) -> Bool
      // excludePath to exclude some paths from the file-system scan
      itemType: 'file',
      // itemType :: 'any' | 'directory' | 'file'
      // specify the type of nodes to display
      // default value: 'any'
      // Root search directory
      message: msg || 'Select a file',
      // rootPath :: String
      // example: itemType: 'file' - hides directories from the item list
      rootPath,
      suggestOnly: true,
      type: 'fuzzypath'
      // suggestOnly :: Bool
      // Restrict prompt answer to available choices or use them as suggestions
    }

    return obj
  }

  public gitremote(): object {
    const obj = {
      filter: this.fsUtils.sanitizeUrl,
      message: 'What is the git remote address?',
      type: 'input'
    }
    return obj
  }

  public list(choices: string[], msg?: string, defaultValue?: string): object {
    const obj = {
      choices,
      default: defaultValue,
      message: msg || 'Choose a value',
      type: 'list'
    }
    return obj
  }

  public async responses(): Promise<any> {
    const inquirer = require('inquirer')
    if (this.fuzzy) {
      inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))
    }

    if (this.allQueries.length > 0) {
      debug(`about to prompt ${this.allQueries.length} queries with inquirer ${JSON.stringify(inquirer)}`)
      const resp: any = await inquirer.prompt(this.allQueries)
      return resp
    }

    return {}
  }

  public textinput(msg?: string, defaultValue?: string, filter?: (val: string) => string): object {
    const obj = {
      default: defaultValue,
      filter,
      message: msg || 'Enter a value',
      type: 'input'
    }
    return obj
  }
}

export const tableize = function (col1: string, col2: string) {
  const moves: { from: string; to: string }[] = []
  const accumulator = function (from: string, to: string) {
    moves.push({ from, to })
  }

  const accumulatorArray = function (arr: { from: string; to: string }[]) {
    for (const line of arr) {
      accumulator(line.from, line.to)
    }
  }

  const show = (title?: string) => {
    if (moves.length > 0) {
      if (title) {
        debug(`showing info for title ${title}`)
        ux.info(normalColor(`${actionStartColor(title)}... ${actionStopColor('done')}`))
      }

      ux.table(
        moves.map(o => ({ from: resultNormalColor(o.from), to: resultHighlighColor(o.to) })),
        {
          ' ->': {
            get: () => ''
          },
          from: {
            header: infoColor(col1),
            minWidth: 30
          },
          to: {
            header: infoColor(col2)
          }
        }
      )
    }
  }

  const returnObj: ITable = { accumulator, accumulatorArray, show }
  return returnObj
}

export interface ITable {
  accumulator: (from: string, to: string) => void
  accumulatorArray: (arr: { from: string; to: string }[]) => void
  show: (title?: string | undefined) => void
}
