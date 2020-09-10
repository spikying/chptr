import { cli } from 'cli-ux'
import * as d from 'debug'
import inquirer = require('inquirer')

import { FsUtils } from './fs-utils'

const chalk: any = require('chalk')
String.prototype.color = function (colorName: string) {
  return chalk[colorName](this)
}
String.prototype.actionStartColor = function () {
  return chalk.blue(this)
}
String.prototype.actionStopColor = function () {
  return chalk.cyan(this)
}
String.prototype.resultHighlighColor = function () {
  return chalk.yellow(this)
}
String.prototype.resultSecondaryColor = function () {
  return chalk.magenta(this)
}
String.prototype.resultNormalColor = function () {
  return chalk.whiteBright(this)
}
String.prototype.infoColor = function () {
  return chalk.gray(this)
}
String.prototype.errorColor = function () {
  return chalk.redBright(this)
}

const debug = d('ui-utils')

export class QueryBuilder {
  private readonly allQueries: object[] = []
  private readonly fsUtils: FsUtils

  constructor(withFuzzyPath = false) {
    debug(`New QueryBuilder instance`)
    if (withFuzzyPath) {
      inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))
    }
    this.fsUtils = new FsUtils()
  }

  public add(name: string, params: object) {
    const obj = { name, ...params }
    this.allQueries.push(obj)
  }

  public async responses(): Promise<any> {
    if (this.allQueries.length > 0) {
      const resp: any = await inquirer.prompt(this.allQueries)
      return resp
    } else {
      return {}
    }
  }

  // public async getFilenameFromInput(msg?: string, defaultValue?: string): Promise<string> {
  //   const responses: any = await inquirer.prompt([
  //     {
  //       name: 'name',
  //       message: msg || 'What name do you want as a filename?',
  //       type: 'input',
  //       default: defaultValue || 'chapter',
  //       filter: sanitizeFileName
  //     }
  //   ])
  //   return responses.name
  // }

  public filename(msg?: string, defaultValue?: string): object {
    const obj = {
      message: msg || 'What name do you want as a filename?',
      type: 'input',
      default: defaultValue || 'chapter',
      filter: this.fsUtils.sanitizeFileName
    }
    return obj
  }

  public gitremote(): object {
    const obj = {
      message: 'What is the git remote address?',
      type: 'input',
      filter: this.fsUtils.sanitizeUrl
    }
    return obj
  }

  public textinput(msg?: string, defaultValue?: string, filter?: (val: string) => string): object {
    const obj = {
      message: msg || 'Enter a value',
      type: 'input',
      default: defaultValue,
      filter
    }
    return obj
  }

  public list(choices: string[], msg?: string, defaultValue?: string): object {
    const obj = {
      message: msg || 'Choose a value',
      type: 'list',
      default: defaultValue,
      choices
    }
    return obj
  }

  public checkboxinput(choices: string[], msg?: string, defaultValue?: string[]): object {
    const obj = {
      message: msg || 'Choose one or more values',
      type: 'checkbox',
      default: defaultValue,
      choices
    }
    return obj
  }

  public fuzzyFilename(rootPath: string, excludePath: (file: string) => boolean, msg?: string): object {
    // debug(`fuzzy: ${excludePath.toString()}`)
    const obj = {
      type: 'fuzzypath',
      // name: 'path',
      excludePath, //nodePath => nodePath.startsWith('node_modules'),
      // excludePath :: (String) -> Bool
      // excludePath to exclude some paths from the file-system scan
      itemType: 'file',
      // itemType :: 'any' | 'directory' | 'file'
      // specify the type of nodes to display
      // default value: 'any'
      // example: itemType: 'file' - hides directories from the item list
      rootPath,
      // rootPath :: String
      // Root search directory
      message: msg || 'Select a file',
      default: '',
      suggestOnly: true
      // suggestOnly :: Bool
      // Restrict prompt answer to available choices or use them as suggestions
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
        cli.info(`${title.actionStartColor()}... ${'done'.actionStopColor()}`.color('white'))
      }

      cli.table(
        moves.map(o => ({ from: o.from.resultNormalColor(), to: o.to.resultHighlighColor() })),
        {
          from: {
            header: col1.infoColor(),
            minWidth: 30
          },
          ' ->': {
            get: () => ''
          },
          to: {
            header: col2.infoColor()
          }
        }
      )
    }
  }

  const returnObj: ITable = { accumulator, show, accumulatorArray }
  return returnObj
}

export interface ITable {
  accumulator: (from: string, to: string) => void
  show: (title?: string | undefined) => void
  accumulatorArray: (arr: { from: string; to: string }[]) => void
}
