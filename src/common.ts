import inquirer = require('inquirer')

import {sanitizeFileName} from './helpers'

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
