import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

import { createDir, d, deleteDir, fileExists } from './base'
import Command from './initialized-base'

const debug = d('command:reorder')

export default class Reorder extends Command {
  static description = 'Takes a chapter and modifies its index number to fit another ordering place'

  static flags = {
    ...Command.flags,
    compact: flags.boolean({
      char: 'c',
      description: 'Compact chapter numbers at the same time',
      default: false
    })
  }

  static args = [
    { name: 'origin', description: 'Chapter number to move', required: true },
    {
      name: 'destination',
      description: 'Number it will become (write `end` or `@end`to put at the end of each stack).',
      required: true
    }
  ]

  static aliases = ['move']

  static hidden = false

  async run() {
    const { args, flags } = this.parse(Reorder)

    const compact = flags.compact

    cli.action.start('Analyzing files'.actionStartColor())

    // const dir = path.join(flags.path as string)
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
      this.error('Origin does not exist'.errorColor())
      this.exit(1)
    }

    if (originNumber === -1) {
      this.error('Origin argument is not a number or `end` or `@end`'.errorColor())
      this.exit(1)
    }
    if (destNumber === -1) {
      this.error('Destination argument is not a number or `end` or `@end`'.errorColor())
      this.exit(1)
    }
    if (destNumber === originNumber && originIsAtNumbering === destIsAtNumbering) {
      this.error('Origin must be different than Destination'.errorColor())
      this.exit(1)
    }

    const sameAtNumbering = originIsAtNumbering === destIsAtNumbering
    const forwardBump: boolean = sameAtNumbering ? destNumber < originNumber : true

    const fileInfoArray = [
      ...new Set(
        (await this.context.getAllFilesForOneType(destIsAtNumbering)).map(file => {
          return this.context.extractNumber(file)
        })
      )
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

    // debug(`toMoveFiles=${JSON.stringify(toMoveFiles, null, 4)}`)

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

    cli.action.stop('done'.actionStopColor())
    cli.action.start('Moving files to temp directory'.actionStartColor())

    const { tempDir, removeTempDir } = await this.getTempDir()
    let oldSubDirectory = ''

    try {
      const moveTempPromises: Promise<MoveSummary>[] = []
      for (const file of toRenameFiles.map(f => f.file)) {
        const fromFilename = this.context.mapFileToBeRelativeToRootPath(file)
        const toFilename = this.context.mapFileToBeRelativeToRootPath(path.join(tempDir, fromFilename))
        debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)

        const directoryPath = path.dirname(path.join(tempDir, fromFilename))
        const directoryExists = await fileExists(directoryPath)
        if (!directoryExists) {
          try {
            await createDir(directoryPath)
          } catch {}
        }

        moveTempPromises.push(this.git.mv(fromFilename, toFilename))

        oldSubDirectory = path.dirname(fromFilename)
      }
      await Promise.all(moveTempPromises)

      cli.action.stop(tempDir.actionStopColor())
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    cli.action.start('Moving files to their final states'.actionStartColor())
    let fileMovesPretty = ''
    let tempSubDirectory = ''

    try {
      const moveBackPromises: Promise<MoveSummary>[] = []
      for (const moveItem of toRenameFiles) {
        const filename = this.context.mapFileToBeRelativeToRootPath(moveItem.file)
        const newFileNumber: number = moveItem.newFileNumber
        const destDigits = this.context.getMaxNecessaryDigits(destIsAtNumbering)

        const fromFilename = this.context.mapFileToBeRelativeToRootPath(path.join(tempDir, filename))
        const toFilename = this.context.renumberedFilename(filename, newFileNumber, destDigits, destIsAtNumbering)

        const directoryPath = path.dirname(path.join(this.configInstance.projectRootPath, toFilename))
        const directoryExists = await fileExists(directoryPath)
        debug(`directoryPath=${directoryPath} directoryExists=${directoryExists}`)
        if (!directoryExists) {
          try {
            await createDir(directoryPath)
          } catch {}
        }

        debug(`TEMPed file: ${fromFilename} BACK TO ${toFilename}`)

        fileMovesPretty.concat(`\n    renaming from "${fromFilename}" to "${toFilename}"`)
        moveBackPromises.push(this.git.mv(fromFilename, toFilename))

        tempSubDirectory = path.dirname(fromFilename)
      }
      await Promise.all(moveBackPromises)
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    if (tempSubDirectory) {
      const subDirExists = await fileExists(path.join(this.configInstance.projectRootPath, tempSubDirectory))
      if (subDirExists) {
        await deleteDir(path.join(this.configInstance.projectRootPath, tempSubDirectory))
      }
    }
    if (oldSubDirectory) {
      const subDirExists = await fileExists(path.join(this.configInstance.projectRootPath, oldSubDirectory))
      if (subDirExists) {
        await deleteDir(path.join(this.configInstance.projectRootPath, oldSubDirectory))
      }
    }
    await removeTempDir()

    cli.action.stop('done'.actionStopColor()) // `Moved files${fileMovesPretty}\n`.actionStopColor() + `Deleted temp folder `.actionStartColor() + `${tempDir}`.actionStopColor())

    const didAddDigits = await this.addDigitsToNecessaryStacks()

    let commitMessage = `Reordered files from ${(originIsAtNumbering ? '@' : '') + originNumber} to ${(destIsAtNumbering ? '@' : '') + destNumber}`
    if (compact) {
      commitMessage += '\nCompacted file numbers'
      await this.compactFileNumbers()
    }
    if (didAddDigits) {
      commitMessage += '\nAdded digits to chapter numbers'
    }

    await this.CommitToGit(commitMessage)
  }

  private readonly isEndOfStack = function(value: string): boolean {
    const re = new RegExp(/^@?end$/)
    return re.test(value)
  }
}
