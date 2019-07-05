// import { flags } from '@oclif/command'
// import * as d from 'debug'
// import Save from './save';
import { cli } from 'cli-ux';
import * as fs from 'fs'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response';

import { getHighestNumberAndDigits } from '../helpers'

import Command, { d } from "./base"

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
    { name: 'origin', description: 'Chapter number to move', required: true },
    {
      name: 'destination',
      description: 'Number it will become (write `end` or `@end`to put at the end of each stack).',
      required: true
    }
  ]

  async run() {
    const { args, flags } = this.parse(Reorder)

    cli.action.start('Processing files')

    const dir = path.join(flags.path as string)
    const originIsAtNumbering = args.origin.toString().substring(0, 1) === '@'
    const destIsAtNumbering = args.destination.toString().substring(0, 1) === '@'
    debug(`origin @ = ${originIsAtNumbering} dest @ = ${destIsAtNumbering}`)


    const files = await this.configInstance.getAllNovelFilesFromDir()
    debug(`files from glob: ${JSON.stringify(files, null, 2)}`)

    const highestNumberAndDigitsOrigin = getHighestNumberAndDigits(files, this.configInstance.chapterRegex(originIsAtNumbering))
    const highestNumberAndDigitsDestination = getHighestNumberAndDigits(files, this.configInstance.chapterRegex(destIsAtNumbering))
    const destDigits = highestNumberAndDigitsDestination.digits
    debug(`Dest digits: ${destDigits}`)

    const origin: number = this.isEndOfStack(args.origin) ? highestNumberAndDigitsOrigin.highestNumber : this.configInstance.extractNumber(args.origin)
    const dest: number = this.isEndOfStack(args.destination) ? highestNumberAndDigitsDestination.highestNumber + 1 : this.configInstance.extractNumber(args.destination)
    debug(`origin = ${origin} dest = ${dest}`)

    const originExists: boolean = files.map(value => {
      // debug(`extractednumber = ${this.configInstance.extractNumber(value)}
      // origin=${origin}
      // is@numbering=${this.configInstance.isAtNumbering(value)}
      // origin is@numbering=${originIsAtNumbering}
      // return=${(this.configInstance.extractNumber(value) === origin) && (this.configInstance.isAtNumbering(value) === originIsAtNumbering)}`)
      return (this.configInstance.extractNumber(value) === origin) && (this.configInstance.isAtNumbering(value) === originIsAtNumbering)
    }).reduce((previous, current) => {
      debug(`previous=${previous} current=${current}`)
      return previous || current
    })
    if (!originExists) {
      this.error('Origin does not exist')
      this.exit(1)
    }

    if (origin === -1) {
      this.error('Origin argument is not a number or `end` or `@end`')
      this.exit(1)
    }
    if (dest === -1) {
      this.error('Destination argument is not a number or `end` or `@end`')
      this.exit(1)
    }
    if (dest === origin && originIsAtNumbering === destIsAtNumbering) {
      this.error('Origin must be different than Destination')
      this.exit(1)
    }

    // const actualDigits = highestNumberAndDigitsDestination.digits
    // const newDigits = numDigits(dest)
    // if (newDigits > actualDigits) {
    //   debug('Adding digits to all')
    //   await this.addDigitsToAll(newDigits, destIsAtNumbering)
    // }

    const sameAtNumbering = originIsAtNumbering === destIsAtNumbering
    const forwardBump: boolean = dest < origin

    const toRenameFiles: string[] = []
    if (sameAtNumbering) {
      toRenameFiles.push(...files
        .filter(value => {
          const fileIsAtNumbering = this.configInstance.isAtNumbering(value)
          if (fileIsAtNumbering !== originIsAtNumbering) {
            return false
          }

          const fileNumber = this.configInstance.extractNumber(value)
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
      toRenameFiles.push(...files
        .filter(value => {
          const fileIsAtNumbering = this.configInstance.isAtNumbering(value)
          const fileNumber = this.configInstance.extractNumber(value)
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

    cli.action.stop()
    cli.action.start('Moving files to temp directory')

    const tempPrefix = 'temp'
    const tempDir = fs.mkdtempSync(path.join(dir, tempPrefix))
    debug(`Created temp dir: ${tempDir}`)

    const moveTempPromises: Promise<MoveSummary>[] = []
    for (const file of toRenameFiles) {
      const fromFilename = this.configInstance.mapFileToBeRelativeToRootPath(file)
      const toFilename = this.configInstance.mapFileToBeRelativeToRootPath(path.join(tempDir, path.basename(file)))
      debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)
      moveTempPromises.push(this.git.mv(fromFilename, toFilename))
    }
    await Promise.all(moveTempPromises)

    cli.action.stop()
    cli.action.start('Moving files to their final state')

    const moveBackPromises: Promise<MoveSummary>[] = []
    for (const file of toRenameFiles) {
      const filename = path.basename(file)

      const fileNumber: number = this.configInstance.extractNumber(file)
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

      const fromFilename = this.configInstance.mapFileToBeRelativeToRootPath(path.join(tempDir, filename))
      const toFilename = this.configInstance.mapFileToBeRelativeToRootPath(path.join(path.dirname(file), this.configInstance.renumberedFilename(filename, newFileNumber, destDigits, fileOutputAtNumbering)))

      this.log(`Renaming with new file number "${path.basename(fromFilename)}" to "${toFilename}"`)
      moveBackPromises.push(this.git.mv(fromFilename, toFilename))
    }
    await Promise.all(moveBackPromises)

    debug(`Deleting temp dir: ${tempDir}`)
    fs.rmdirSync(tempDir)

    await this.addDigitsToNecessaryStacks()

    cli.action.stop()
    cli.action.start('Commit and push to remote repository')

    await this.git.commit(`Reordered files from ${(originIsAtNumbering ? '@' : '') + origin} to ${(destIsAtNumbering ? '@' : '') + dest}`)
    await this.git.push()
    await this.git.pull()
    // Save.run([`--path=${flags.path}`, `Reordered files from ${(originIsAtNumbering ? '@' : '') + origin} to ${(destIsAtNumbering ? '@' : '') + dest}`])
    cli.action.stop()
  }

  private readonly isEndOfStack = function (value: string): boolean {
    const re = new RegExp(/^@?end$/)
    return re.test(value)
  }
}
