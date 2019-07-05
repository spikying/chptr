import * as d from 'debug'
// import * as fs from 'fs'
// import { url } from 'inspector';
import * as path from 'path'
import * as sanitize from 'sanitize-filename'
// import { promisify } from "util";

// import uuid = require('uuid/v5');
// import { Config } from './config';



export interface FileWithPriority {
  filename: string
  directory: string
  priority: number
  number: number
}

// const numberingRegex: RegExp = /^(\d+)(.*)/

export const numDigits = function (x: number, buffer = 2) {
  return Math.max(Math.floor(Math.log10(Math.abs(x + buffer))), 0) + 1
}

export const stringifyNumber = function (x: number, digits: number): string { //, unNumbered: boolean): string {
  // if (unNumbered) {
  //   return uuid().substring(0, 4)
  // }
  // else {
  const s = x.toString()
  const zeroes = Math.max(digits - s.length, 0)
  if (zeroes > 0) {
    return '0'.repeat(zeroes).concat(s)
  } else {
    return s
  }
  // }
}

export const filterNumbers = function (s: string): string {
  return s.replace(/.*?(\d+).*/, '$1')
}

export const sanitizeFileName = function (original: string): string {
  const debug = d('helpers:sanitizeFileName')
  const sanitized = sanitize(original)
  debug(`Original filename = ${original}`)
  debug(`Sanitized filename = ${sanitized}`)
  return sanitized
}

const sanitize_url = require('@braintree/sanitize-url').sanitizeUrl
export const sanitizeUrl = function (original: string): string {
  const debug = d('helpers:sanitizeUrl')
  const sanitized = sanitize_url(original)
  if (sanitized === 'about:blank') {
    return ''
  }
  debug(`Original url = ${original}`)
  debug(`Sanitized url = ${sanitized}`)
  return sanitized
}

export const getHighestNumberAndDigits = function (files: string[], fileRegex: RegExp): {
  highestNumber: number,
  // maxDigits: number,
  minDigits: number,
  maxNecessaryDigits: number
} {
  const debug = d('helpers:getHighestNumberAndDigits')

  debug(`files: length=${files.length} full=${JSON.stringify(files)}`)
  if (files.length === 0) {
    return {
      highestNumber: 0,
      // maxDigits: 1,
      minDigits: 1, maxNecessaryDigits: 1
    }
  }

  debug(`files searched: ${JSON.stringify(files)}`)
  debug(`Regex used: ${fileRegex}`)

  const highestNumber = files.map(value => {
    // debug(`Regex exec: ${JSON.stringify(fileRegex.exec(path.basename(value)))}`)
    const matches = fileRegex.exec(path.basename(value))
    return matches ? parseInt(matches[1], 10) : 0
  }).reduce((previous, current) => {
    return Math.max(previous, current)
  })

  const maxDigits = files
    .map(value => {
      const matches = fileRegex.exec(path.basename(value))
      return matches ? matches[1].length : 0
    })
    .reduce((previous, current) => {
      return Math.max(previous, current)
    })

  const minDigits = files
    .map(value => {
      const matches = fileRegex.exec(path.basename(value))
      return matches ? matches[1].length : 0
    })
    .reduce((previous, current) => {
      return Math.min(previous, current)
    })

  const maxNecessaryDigits = files
    .map(value => {
      const matches = fileRegex.exec(path.basename(value))
      return matches ? numDigits(parseInt(matches[1], 10)) : 0
    })
    .reduce((previous, current) => {
      return Math.max(previous, current)
    })

  debug(`highest number = ${highestNumber}`)
  debug(`digits = ${maxDigits}`)
  return {
    highestNumber,
    // maxDigits,
    minDigits, maxNecessaryDigits
  }
}


