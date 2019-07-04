// import { flags } from '@oclif/command'
// import * as d from 'debug'
import * as fs from 'fs'
import * as path from 'path'

import { extractNumber, getAllNovelFilesFromDir, getHighestNumberAndDigits, renumberedFilename } from '../helpers'

import Command, { d, moveFile } from "./base"

const debug = d('command:reorder')
// const debugEnabled = d.enabled('command:reorder')

export default class Reorder extends Command {
  static description =
    'Takes a chapter and modifies its index number to fit another ordering place'

  static flags = {
    ...Command.flags
    // ,
    // deep: flags.boolean({
    //   char: 'd',
    //   description: 'Makes a recursive subfolder search'
    // })
  }

  static args = [
    { name: 'origin', description: 'chapter number to move', required: true },
    {
      name: 'destination',
      description: 'number it will become',
      required: true
    }
  ]

  async run() {
    const { args, flags } = this.parse(Reorder)

    let origin: number = extractNumber(args.origin, this.configInstance) //parseInt(args.origin.replace(/^(\d+).*$/, '$1'), 10)
    const originIsAtNumbering = this.configInstance.isAtNumbering(args.origin)
    let dest: number = extractNumber(args.destination, this.configInstance) //parseInt(args.destination.replace(/^(\d+).*$/, '$1'), 10)
    const destIsAtNumbering = this.configInstance.isAtNumbering(args.destination)

    if (origin === -1 && !originIsAtNumbering) {
      this.error('Origin argument is not a number')
      this.exit(1)
    }
    if (dest === -1 && !destIsAtNumbering) {
      this.error('Destination argument is not a number')
      this.exit(1)
    }
    if (dest === origin && originIsAtNumbering === destIsAtNumbering) {
      this.error('Origin must be different than Destination')
      this.exit(1)
    }

    const sameAtNumbering = originIsAtNumbering === destIsAtNumbering
    const forwardBump: boolean = dest < origin

    const dir = path.join(flags.path as string)

    const files = await getAllNovelFilesFromDir(dir, this.configInstance)
    debug(`files from glob: ${JSON.stringify(files, null, 2)}`)

    const highestNumberAndDigitsOrigin = getHighestNumberAndDigits(files, this.configInstance.chapterRegex(originIsAtNumbering))
    const highestNumberAndDigitsDestination = getHighestNumberAndDigits(files, this.configInstance.chapterRegex(destIsAtNumbering))
    const destDigits = highestNumberAndDigitsDestination.digits
    debug(`Dest digits: ${destDigits}`)

    if (origin === -1) {
      origin = highestNumberAndDigitsOrigin.highestNumber
    }
    if (dest === -1) {
      dest = highestNumberAndDigitsDestination.highestNumber
    }

    const toRenameFiles: string[] = []
    if (sameAtNumbering) {
      toRenameFiles.concat(files
        .filter(value => {
          const fileIsAtNumbering = this.configInstance.isAtNumbering(value)
          if (fileIsAtNumbering !== originIsAtNumbering) {
            return false
          }

          const fileNumber = extractNumber(value, this.configInstance)
          if (
            fileNumber < Math.min(origin, dest) ||
            fileNumber > Math.max(origin, dest)
          ) {
            return false
          }
          if (fileNumber < 0) {
            return false
          }
          return true
        })
      )
    } else {
      toRenameFiles.concat(files
        .filter(value => {
          const fileIsAtNumbering = this.configInstance.isAtNumbering(value)
          const fileNumber = extractNumber(value, this.configInstance)
          if (fileIsAtNumbering === originIsAtNumbering) {
            if (
              fileNumber < origin
            ) {
              return false
            }
            if (fileNumber < 0) {
              return false
            }
            return true
          } else {
            if (
              fileNumber < dest
            ) {
              return false
            }
            if (fileNumber < 0) {
              return false
            }
            return true
          }
        })
      )
    }
    if (toRenameFiles.length === 0) {
      this.warn('No file to rename')
      this.exit(0)
    }


    const tempPrefix = 'temp'
    const tempDir = fs.mkdtempSync(path.join(dir, tempPrefix))
    debug(`Created temp dir: ${tempDir}`)

    const moveTempPromises: Promise<void>[] = []
    for (const file of toRenameFiles) {
      const fromFilename = file
      const toFilename = path.join(tempDir, path.basename(file))
      debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)
      moveTempPromises.push(moveFile(fromFilename, toFilename))
    }
    await Promise.all(moveTempPromises)

    const moveBackPromises: Promise<void>[] = []
    for (const file of toRenameFiles) {
      const filename = path.basename(file)

      const fileNumber: number = extractNumber(file, this.configInstance)
      let newFileNumber: number
      let fileOutputAtNumbering = false

      if (sameAtNumbering) {
        fileOutputAtNumbering = originIsAtNumbering

        if (fileNumber === origin) {
          newFileNumber = dest
        } else {
          if (forwardBump) {
            newFileNumber = fileNumber + 1
          } else {
            newFileNumber = fileNumber - 1
          }
        }
      } else {
        const fileIsAtNumbering = this.configInstance.isAtNumbering(file)
        if (fileIsAtNumbering === originIsAtNumbering) {
          if (fileNumber === origin) {
            fileOutputAtNumbering = destIsAtNumbering
            newFileNumber = dest
          } else {
            fileOutputAtNumbering = originIsAtNumbering
            newFileNumber = fileNumber - 1
          }
        } else {
          fileOutputAtNumbering = destIsAtNumbering
          newFileNumber = fileNumber + 1
        }
      }
      debug(`fileNumber = ${fileNumber}, newFileNumber=${newFileNumber}`)

      const fromFilename = path.join(tempDir, filename)

      const toFilename = path.join(path.dirname(file), renumberedFilename(filename, newFileNumber, destDigits, fileOutputAtNumbering))
      this.log(`renaming with new file number "${fromFilename}" to "${toFilename}"`)
      moveBackPromises.push(moveFile(fromFilename, toFilename))
    }
    await Promise.all(moveBackPromises)

    debug(`Deleting temp dir: ${tempDir}`)
    fs.rmdirSync(tempDir)
    // })
  }
}
