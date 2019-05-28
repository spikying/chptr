import {Command} from '@oclif/command'
import * as d from 'debug'
import * as fs from 'fs'
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
  return Math.max(Math.floor(Math.log10(Math.abs(x + buffer))), 0) + 1
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

export const sanitizeFileName = function (original: string): string {
  return sanitize(original)
}

export const renumberedFilename = function (
  filename: string,
  newFilenumber: number
): string {
  const fileNumberString: string = path
    .basename(filename)
    .replace(numberingRegex, '$1')
  const digits = fileNumberString.length
  return filename.replace(
    numberingRegex,
    stringifyNumber(newFilenumber, digits) + '$2'
  )
}
