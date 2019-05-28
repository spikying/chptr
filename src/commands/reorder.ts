import {Command, flags} from '@oclif/command'
import * as d from 'debug'
import * as fs from 'fs'
import * as path from 'path'
const debug = d('command:reorder')

import {stringifyNumber, walk} from '../helpers'

export default class Reorder extends Command {
  static description =
    'Takes a chapter and modifies its index number to fit another ordering place'

  static flags = {
    help: flags.help({char: 'h'}),
    path: flags.string({
      char: 'p',
      default: '.',
      description: 'Path where chapter files are'
    }),
    deep: flags.boolean({
      char: 'd',
      description: 'Makes a recursive subfolder search'
    })
  }

  static args = [
    {name: 'origin', description: 'chapter number to move', required: true},
    {
      name: 'destination',
      description: 'number it will become',
      required: true
    }
  ]

  async run() {
    const {args, flags} = this.parse(Reorder)

    const origin: number = parseInt(args.origin, 10)
    const dest: number = parseInt(args.destination, 10)

    if (isNaN(origin)) {
      this.error('Origin argument is not a number')
      this.exit(1)
    }
    if (isNaN(dest)) {
      this.error('Destination argument is not a number')
      this.exit(1)
    }
    if (dest === origin) {
      this.error('Origin must be different than Destination')
      this.exit(1)
    }

    const forwardBump: boolean = dest < origin

    const dir = path.join(flags.path as string) //path.parse(flags.path || '')
    this.log(`Walking directory ${JSON.stringify(dir)}`)

    await walk(dir, flags.deep, 0, (err, files) => {
      if (err) {
        this.error(err)
        this.exit(1)
      }

      const re: RegExp = /^(\d+)(.*)/

      const toRenameFiles = files
        .filter(value => {
          const filename = path.basename(value.filename)
          // this.log(
          //   `filename=${filename} file value=${value.filename} file dir=${value.directory} priority=${value.priority}`
          // )
          const fileNumber = parseInt(filename.replace(re, '$1'), 10)
          if (
            fileNumber < Math.min(origin, dest) ||
            fileNumber > Math.max(origin, dest)
          ) {
            return false
          }
          if (isNaN(fileNumber)) {
            return false
          }
          return true
        })
        .sort((a, b) => {
          const aNum = a.priority //parseInt(path.basename(a).replace(re, '$1'), 10)
          const bNum = b.priority //parseInt(path.basename(b).replace(re, '$1'), 10)
          return bNum - aNum
        })

      if (toRenameFiles.length === 0) {
        this.warn('No file to rename')
        this.exit(0)
      }

      debug('List of files to rename in order:')
      toRenameFiles.forEach(file => {
        debug(`    Original file: ${file.filename} priority: ${file.priority}`)
      })

      /*
        //get number of digits to put in chapter number
      let highestFileNumber = 0

      files.forEach(file => {
        const fileNumber: number = parseInt(file.replace(re, '$1'), 10)
        if (fileNumber > highestFileNumber) {
          highestFileNumber = fileNumber
        }
      })
      const digits = numDigits(highestFileNumber)
*/
      // const originFiles = files.filter(value => {
      //   const filename = path.basename(value)
      //   const fileNumber = parseInt(filename.replace(re, '$1'), 10)
      //   if (fileNumber === origin) {
      //     return true
      //   }
      //   return false
      // })

      const tempPrefix = 'temp'
      const tempDir = fs.mkdtempSync(path.join(dir, tempPrefix))
      this.log(`Created temp dir: ${tempDir}`)

      toRenameFiles.forEach(file => {
        if (file.priority === 0) {
          const filename = path.basename(file.filename)

          const fromFilename = file.filename
          const toFilename = path.join(tempDir, filename)
          debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)
          fs.renameSync(fromFilename, toFilename)
        }
      })

      // let renumberAll = false

      toRenameFiles.forEach(file => {
        const filename = path.basename(file.filename)
        const fileNumberString: string = filename.replace(re, '$1')
        const digits = fileNumberString.length

        // if (fileNumberString.length !== digits) {
        //   renumberAll = true
        //   this.log('renumbering all')
        // }
        const fileNumber: number = parseInt(fileNumberString, 10)
        let newFileNumber: number

        if (fileNumber === origin) {
          newFileNumber = dest
        } else {
          if (forwardBump) {
            newFileNumber = fileNumber + 1
          } else {
            newFileNumber = fileNumber - 1
          }
        }
        // this.log(`fileNumber = ${fileNumber}, newFileNumber=${newFileNumber}`)

        const fromFilename =
          file.priority === 0
            ? path.join(tempDir, filename)
            : path.join(path.dirname(file.filename), filename)
        const toFilename = path.join(
          path.dirname(file.filename),
          filename.replace(re, stringifyNumber(newFileNumber, digits) + '$2')
        )
        this.log(
          `renaming with new file number "${fromFilename}" to "${toFilename}"`
        )
        fs.renameSync(fromFilename, toFilename)
      })

      this.log(`Deleting temp dir: ${tempDir}`)
      fs.rmdirSync(tempDir)

      // originFiles.forEach(file => {
      //   fs.renameSync(
      //     file.replace(re, 'XXXX$2'),
      //     file.replace(re, stringifyNumber(dest, digits) + '$2')
      //   )
      // })
    })
  }
}
