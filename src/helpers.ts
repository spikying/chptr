import { Command } from '@oclif/command'
import * as d from 'debug'
import * as fs from 'fs'
import { url } from 'inspector';
import * as path from 'path'
import * as sanitize from 'sanitize-filename'

export interface FileWithPriority {
  filename: string
  directory: string
  priority: number
  number: number
}

const numberingRegex: RegExp = /^(\d+)(.*)/

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

    const extractNumber = (filename: string) => {
      const fileNumber = parseInt(
        path.basename(filename).replace(numberingRegex, '$1'),
        10
      )
      if (isNaN(fileNumber)) {
        return -1
      }
      return fileNumber
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

export const numDigits = function (x: number, buffer = 2) {
  return Math.min(5, Math.max(Math.floor(Math.log10(Math.abs(x + buffer))), 0) + 1)
}

export const stringifyNumber = function (x: number, digits: number): string {
  const s = x.toString()
  const zeroes = Math.max(digits - s.length, 0)
  if (zeroes > 0) {
    return '0'.repeat(zeroes).concat(s)
  } else {
    return s
  }
}

export const filterNumbers = function (s: string): string {
  return s.replace(/.*?(\d+).*/, '$1')
}

export const addDigitsToAll = async function (dir: string, digits: number) {
  await walk(dir, false, 0, (err, files) => {
    if (err) {
      Command.prototype.error(err)
      Command.prototype.exit(1)
    }

    const numberedFiles = files.filter(value => {
      return value.number >= 0
    })

    numberedFiles.forEach(file => {
      const filename = path.basename(file.filename)
      const fromFilename = path.join(path.dirname(file.filename), filename)
      const toFilename = path.join(
        path.dirname(file.filename),
        renumberedFilename(filename, file.number, digits)
      )
      Command.prototype.log(
        `renaming with new file number "${fromFilename}" to "${toFilename}"`
      )
      fs.renameSync(fromFilename, toFilename)
    })
  })
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
  digits: number
): string {
  // const fileNumberString: string = path
  //   .basename(filename)
  //   .replace(numberingRegex, '$1')
  // digits = digits || fileNumberString.length
  return filename.replace(
    numberingRegex,
    stringifyNumber(newFilenumber, digits) + '$2'
  )
}

export const getHighestNumberAndDigits = function (
  files: FileWithPriority[]
): { highestNumber: number; digits: number } {
  const debug = d('helpers:getHighestNumberAndDigits')
  const numberedFiles = files
    .filter(value => {
      return value.number >= 0
    })
    .sort((a, b) => {
      const aNum = a.number
      const bNum = b.number
      return bNum - aNum
    })

  const highestNumber = numberedFiles[0].number
  const digits = numberedFiles
    .map(value => {
      debug(`map value=${JSON.stringify(value)} return ${numDigits(value.number)}`)
      return path.basename(value.filename).replace(numberingRegex, '$1').length
      // return numDigits(value.number)
    })
    .reduce((previous, current) => {
      debug(`reduce previous=${previous} current=${current} return ${Math.max(previous, current)}`)
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

