import * as d from "debug";
import inquirer = require('inquirer')

import { sanitizeFileName, sanitizeUrl } from './helpers'

const debug = d("queries");

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

  constructor() {

  }

  public add(name: string, params: object) {
    const obj = { name, ...params }
    debug(`adding obj = ${obj}`)
    this.allQueries.push(obj)
  }

  public async responses(): Promise<any> {
    debug(`allQueries = ${JSON.stringify(this.allQueries)}`)
    if (this.allQueries.length > 0) {
      const resp: any = await inquirer.prompt(this.allQueries)
      debug(`resp = ${JSON.stringify(resp)}`)
      return resp //.responses
    } else {
      return {}
    }
  }

  // private async showPrompts() {
  //   const responses: any = await inquirer.prompt(this.allQueries)
  //   return responses
  // }

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

  // public addExistingFilesQuery(name: string, msg?: string): void {
  //   const obj = {
  //     type: 'list',
  //     name: name + 'Type',
  //     message: (msg ? msg + '\n' : '') + 'How do you want to choose which files?',
  //     choices: ['By chapter number', 'By manual filename pattern input', 'By filestructure navigation'],
  //     default: 0
  //   }
  //   this.add(name + 'Type', obj)
  // }
}
