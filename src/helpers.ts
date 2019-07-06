import * as d from 'debug'
// import * as fs from 'fs'
// import { url } from 'inspector';
// import * as path from 'path'
import * as sanitize from 'sanitize-filename'
// import { promisify } from "util";

// import uuid = require('uuid/v5');
// import { Config } from './config';



// export interface FileWithPriority {
//   filename: string
//   directory: string
//   priority: number
//   number: number
// }

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

// export const filterNumbers = function (s: string): string {
//   return s.replace(/.*?(\d+).*/, '$1')
// }

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
