import inquirer = require('inquirer')

import { sanitizeFileName, sanitizeUrl } from './helpers'

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
    this.allQueries.push(obj)
  }

  public async responses(): Promise<any> {
    if (this.allQueries.length > 0) {
      const resp: any = await inquirer.prompt(this.allQueries)
      return resp.responses
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
}
