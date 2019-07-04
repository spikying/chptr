import * as d from 'debug'
// import * as fs from 'fs'
import * as glob from "glob";
// import { url } from 'inspector';
import * as path from 'path'
import * as sanitize from 'sanitize-filename'
import { promisify } from "util";

// import uuid = require('uuid/v5');
import { Config } from './config';

const globPromise = promisify(glob)

export interface FileWithPriority {
  filename: string
  directory: string
  priority: number
  number: number
}

// const numberingRegex: RegExp = /^(\d+)(.*)/

export const getAllNovelFilesFromDir = async function (dir: string, configInstance: Config): Promise<string[]> {
  const debug = d('helpers:getAllNovelFilesFromDir')

  const files: string[] = []
  const wildcards = [
    configInstance.chapterWildcard(true),
    configInstance.metadataWildcard(true),
    configInstance.summaryWildcard(true),
    configInstance.chapterWildcard(false),
    configInstance.metadataWildcard(false),
    configInstance.summaryWildcard(false)
  ]
  for (const wildcard of wildcards) {
    debug(`glob pattern = ${path.join(dir, wildcard)}`)
    debug(glob.sync(path.join(dir, wildcard)))
    files.push(...await globPromise(path.join(dir, wildcard)))
  }
  return files
}

export const extractNumber = (filename: string, configInstance: Config): number => {
  const re = new RegExp(configInstance.numbersPattern(false))
  const fileNumber = parseInt(
    path.basename(filename).replace(re, '$1'),
    10
  )
  if (isNaN(fileNumber)) {
    return -1
  }
  return fileNumber
}
/*
export const walk = async function (
  dir: string,
  deep: boolean,
  level = 0,
  done: (err: Error | null, results: FileWithPriority[]) => void
) {
  const debug = d('helpers:walk')

  let results: FileWithPriority[] = []
  debug(`Entering fs.readdir in Walk function with dir=${dir}`)
  await fs.readdir(dir, function (err, list) {
    if (err) {
      return done(err, [])
    }

    let pending = list.length
    if (!pending) {
      return done(null, results)
    }


    list.forEach(function (file) {
      file = path.resolve(dir, file)
      fs.stat(file, async function (err, stat) {
        if (err) {
          Command.prototype.error(err)
          Command.prototype.exit(1)
        }

        if (stat && stat.isDirectory() && deep) {
          await walk(file, deep, level + 2, function (err, res) {
            if (err) {
              Command.prototype.error(err)
              Command.prototype.exit(1)
            }

            results = results.concat(res)
            if (!--pending) {
              done(null, results)
            }
          })
          results = results.concat({
            filename: file,
            directory: dir,
            priority: level + 1,
            number: extractNumber(file)
          })
        } else {
          results.push({
            filename: file,
            directory: dir,
            priority: level,
            number: extractNumber(file)
          })

          if (!--pending) {
            done(null, results)
          }
        }
      })
    })
  })
}
*/

export const numDigits = function (x: number, buffer = 2) {
  return Math.min(1, Math.max(Math.floor(Math.log10(Math.abs(x + buffer))), 0) + 1)
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

export const renumberedFilename = function (
  filename: string,
  newFilenumber: number,
  digits: number,
  atNumbering: boolean
): string {
  return filename.replace(
    Config.prototype.numbersPattern(atNumbering),
    stringifyNumber(newFilenumber, digits) + '$2'
  )
}

export const getHighestNumberAndDigits = function (
  files: string[] //FileWithPriority[]
  , fileRegex: RegExp
): { highestNumber: number; digits: number } {
  const debug = d('helpers:getHighestNumberAndDigits')

  debug(`files searched: ${JSON.stringify(files)}`)
  debug(`Regex used: ${fileRegex}`)
  const highestNumber = files.map(value => {
    debug(`Regex exec: ${JSON.stringify(fileRegex.exec(path.basename(value)))}`)
    const matches = fileRegex.exec(path.basename(value))
    return matches ? parseInt(matches[1], 10) : 0
  }).reduce((previous, current) => {
    return Math.max(previous, current)
  })

  const digits = files
    .map(value => {
      const matches = fileRegex.exec(path.basename(value))
      return matches ? matches[1].length : 0
    })
    .reduce((previous, current) => {
      return Math.max(previous, current)
    })

  debug(`highest number = ${highestNumber}`)
  debug(`digits = ${digits}`)
  return { highestNumber, digits }
}

export const mapFilesToBeRelativeToRootPath = function (files: string[], rootPath: string): string[] {
  return files.map<string>((filename) => {
    return path.relative(rootPath, filename)
  });
}

