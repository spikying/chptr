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
      filter: sanitizeFileName,
    },
  ])
  return responses.name
}

export class QueryBuilder {
  private readonly allQueries: object[] = []

  constructor() {
    debug(`New QueryBuilder instance`)
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
      filter: sanitizeFileName,
    }
    return obj
  }

  public gitremote(): object {
    const obj = {
      message: 'What is the git remote address?',
      type: 'input',
      filter: sanitizeUrl,
    }
    return obj
  }

  public textinput(msg?: string, defaultValue?: string): object {
    const obj = {
      message: msg || 'Enter a value',
      type: 'input',
      default: defaultValue,
    }
    return obj
  }

  public checkboxinput(choices: string[], msg?: string, defaultValue?: string[]): object {
    const obj = {
      message: msg || 'Choose a value',
      type: 'checkbox',
      default: defaultValue,
      choices,
    }
    return obj
  }
}
