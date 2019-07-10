import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as fs from 'fs'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'


import { d } from './base'
import Command from './edit-save-base'

const debug = d('command:reorder')

export default class Reorder extends Command {
  static description = 'Takes a chapter and modifies its index number to fit another ordering place'

  static flags = {
    ...Command.flags,
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false,
    }),
  }

  static args = [
    { name: 'origin', description: 'Chapter number to move', required: true },
    {
      name: 'destination',
      description: 'Number it will become (write `end` or `@end`to put at the end of each stack).',
      required: true,
    },
  ]

  static aliases = ['move']

  static hidden = false

  async run() {
    const { args, flags } = this.parse(Reorder)

    const compact = flags.compact

    cli.action.start('Analyzing files'.actionStartColor())

    const dir = path.join(flags.path as string)
    const originIsAtNumbering = args.origin.toString().substring(0, 1) === '@'
    const destIsAtNumbering = args.destination.toString().substring(0, 1) === '@'

    const files = await this.context.getAllNovelFiles()

    const originNumber: number = this.isEndOfStack(args.origin) ? this.context.getHighestNumber(originIsAtNumbering) : this.context.extractNumber(args.origin)
    const destNumber: number = this.isEndOfStack(args.destination)
      ? this.context.getHighestNumber(destIsAtNumbering) === 0
        ? this.configInstance.config.numberingInitial
        : this.context.getHighestNumber(destIsAtNumbering) + this.configInstance.config.numberingStep
      : this.context.extractNumber(args.destination)

    const originExists: boolean = files
      .map(value => {
        return this.context.extractNumber(value) === originNumber && this.configInstance.isAtNumbering(value) === originIsAtNumbering
      })
      .reduce((previous, current) => {
        return previous || current
      })
    if (!originExists) {
      this.error('Origin does not exist')
      this.exit(1)
    }

    if (originNumber === -1) {
      this.error('Origin argument is not a number or `end` or `@end`')
      this.exit(1)
    }
    if (destNumber === -1) {
      this.error('Destination argument is not a number or `end` or `@end`')
      this.exit(1)
    }
    if (destNumber === originNumber && originIsAtNumbering === destIsAtNumbering) {
      this.error('Origin must be different than Destination')
      this.exit(1)
    }

    const sameAtNumbering = originIsAtNumbering === destIsAtNumbering
    const forwardBump: boolean = sameAtNumbering ? destNumber < originNumber : true

    const fileInfoArray = [
      ...new Set(
        (await this.context.getAllFilesForOneType(destIsAtNumbering)).map(file => {
          return this.context.extractNumber(file)
        })
      ),
    ] //to make unique
      .filter(fileNumber => {
        if (sameAtNumbering) {
          if (fileNumber < Math.min(originNumber, destNumber) || fileNumber > Math.max(originNumber, destNumber) || fileNumber < 0) {
            return false
          } else {
            return true
          }
        } else {
          return fileNumber >= destNumber
        }
      })
      .map(fileNumber => {
        let newFileNumber: number
        let mandatory = false
        if (fileNumber === originNumber && sameAtNumbering) {
          newFileNumber = destNumber
          mandatory = true
        } else {
          if (forwardBump) {
            newFileNumber = fileNumber + 1
          } else {
            newFileNumber = fileNumber - 1
          }
        }
        return { fileNumber, newFileNumber, mandatory }
      })

    let currentMandatory = sameAtNumbering ? fileInfoArray.filter(f => f.mandatory)[0] : { fileNumber: null, newFileNumber: destNumber, mandatory: true }
    const allMandatories = [currentMandatory]
    while (currentMandatory) {
      let nextMandatory = fileInfoArray.filter(f => !f.mandatory && f.fileNumber === currentMandatory.newFileNumber)[0]
      if (nextMandatory) {
        allMandatories.push(nextMandatory)
      }
      currentMandatory = nextMandatory
    }

    const toMoveFiles = fileInfoArray.filter(info => {
      return allMandatories.map(m => m.fileNumber).includes(info.fileNumber)
    })

    debug(`toMoveFiles=${JSON.stringify(toMoveFiles, null, 4)}`)

    const toRenameFiles = (await this.context.getAllFilesForOneType(destIsAtNumbering))
      .filter(file => {
        const fileNumber = this.context.extractNumber(file)
        return toMoveFiles.map(m => m.fileNumber).includes(fileNumber)
      })
      .map(file => {
        const fileNumber = this.context.extractNumber(file)
        const mf = toMoveFiles.filter(m => m.fileNumber === fileNumber)[0]
        return { file, newFileNumber: mf.newFileNumber }
      })

    if (!sameAtNumbering) {
      const originFiles = (await this.context.getAllFilesForOneType(originIsAtNumbering)).filter(file => {
        return this.context.extractNumber(file) === originNumber
      })

      for (const f of originFiles) {
        toRenameFiles.push({ file: f, newFileNumber: destNumber })
      }
    }

    debug(`toRenameFiles=${JSON.stringify(toRenameFiles, null, 2)}`)

    cli.action.stop('done'.actionStopColor())
    cli.action.start('Moving files to temp directory'.actionStartColor())

    let tempDir = ''
    try {
      const tempPrefix = 'temp'
      tempDir = fs.mkdtempSync(path.join(dir, tempPrefix))
      debug(`Created temp dir: ${tempDir}`)
    } catch (err) {
      cli.error(err.errorColor())
      cli.exit(1)
    }

    try {
      const moveTempPromises: Promise<MoveSummary>[] = []
      for (const file of toRenameFiles.map(f => f.file)) {
        const fromFilename = this.context.mapFileToBeRelativeToRootPath(file)
        const toFilename = this.context.mapFileToBeRelativeToRootPath(path.join(tempDir, path.basename(file)))
        debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)
        moveTempPromises.push(this.git.mv(fromFilename, toFilename))
      }
      await Promise.all(moveTempPromises)

      cli.action.stop(tempDir.actionStopColor())
    } catch (err) {
      cli.error(err.errorColor())
      cli.exit(1)
    }

    cli.action.start('Moving files to their final states'.actionStartColor())
    let fileMovesPretty = ''

    try {
      const moveBackPromises: Promise<MoveSummary>[] = []
      for (const moveItem of toRenameFiles) {
        const filename = path.basename(moveItem.file)
        const newFileNumber: number = moveItem.newFileNumber
        const destDigits = this.context.getMaxNecessaryDigits(destIsAtNumbering)

        const fromFilename = this.context.mapFileToBeRelativeToRootPath(path.join(tempDir, filename))
        const toFilename = this.context.mapFileToBeRelativeToRootPath(
          path.join(path.dirname(moveItem.file), this.context.renumberedFilename(filename, newFileNumber, destDigits, destIsAtNumbering))
        )

        fileMovesPretty.concat(`\n    renaming from "${path.basename(fromFilename)}" to "${toFilename}"`)
        moveBackPromises.push(this.git.mv(fromFilename, toFilename))
      }
      await Promise.all(moveBackPromises)
    } catch (err) {
      cli.error(err.errorColor())
      cli.exit(1)
    }

    try {
      debug(`Deleting temp dir: ${tempDir}`)
      fs.rmdirSync(tempDir)
    } catch (err) {
      cli.error(err.errorColor())
      cli.exit(1)
    }

    cli.action.stop(`Moved files${fileMovesPretty}\nDeleted temp folder ${tempDir}`.actionStopColor())

    await this.addDigitsToNecessaryStacks()

    let commitMessage = `Reordered files from ${(originIsAtNumbering ? '@' : '') + originNumber} to ${(destIsAtNumbering ? '@' : '') + destNumber}`
    if (compact) {
      commitMessage += '\nCompacted file numbers'
      await this.compactFileNumbers()
    }

    // cli.action.start('Commit and push to remote repository')
    await this.CommitToGit(commitMessage)
    // await this.git.commit(commitMessage)
    // await this.git.push()
    // await this.git.pull()
    // cli.action.stop()
  }

  private readonly isEndOfStack = function(value: string): boolean {
    const re = new RegExp(/^@?end$/)
    return re.test(value)
  }
}
