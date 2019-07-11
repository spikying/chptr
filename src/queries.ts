import * as d from 'debug'
import inquirer = require('inquirer')

import { sanitizeFileName, sanitizeUrl } from './commands/base'

const debug = d('queries')

export const getFilenameFromInput = async (msg?: string, defaultValue?: string) => {
  const responses: any = await inquirer.prompt([
    {
      name: 'name',
      message: msg || 'What name do you want as a filename?',
      type: 'input',
      default: defaultValue || 'chapter',
      filter: sanitizeFileName
    }
  ])
  return responses.name
}

export class QueryBuilder {
  private readonly allQueries: object[] = []

  constructor(withFuzzyPath = false) {
    debug(`New QueryBuilder instance`)
    if (withFuzzyPath) {
      inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))
    }
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

  public filename(msg?: string, defaultValue?: string): object {
    const obj = {
      message: msg || 'What name do you want as a filename?',
      type: 'input',
      default: defaultValue || 'chapter',
      filter: sanitizeFileName
    }
    return obj
  }

  public gitremote(): object {
    const obj = {
      message: 'What is the git remote address?',
      type: 'input',
      filter: sanitizeUrl
    }
    return obj
  }

  public textinput(msg?: string, defaultValue?: string): object {
    const obj = {
      message: msg || 'Enter a value',
      type: 'input',
      default: defaultValue
    }
    return obj
  }

  public checkboxinput(choices: string[], msg?: string, defaultValue?: string[]): object {
    const obj = {
      message: msg || 'Choose a value',
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
