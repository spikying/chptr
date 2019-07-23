import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as path from 'path'
import { MoveSummary } from 'simple-git/typings/response'

import { d } from './base'
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

    const originIsAtNumbering = args.origin.toString().substring(0, 1) === '@'
    const destIsAtNumbering = args.destination.toString().substring(0, 1) === '@'

    const files = await this.statistics.getAllNovelFiles()

    const originNumber: number = this.isEndOfStack(args.origin)
      ? this.statistics.getHighestNumber(originIsAtNumbering)
      : this.softConfig.extractNumber(args.origin)
    const destNumber: number = this.isEndOfStack(args.destination)
      ? this.statistics.getHighestNumber(destIsAtNumbering) === 0
        ? this.softConfig.config.numberingInitial
        : this.statistics.getHighestNumber(destIsAtNumbering) + this.softConfig.config.numberingStep
      : this.softConfig.extractNumber(args.destination)

    const originExists: boolean = files
      .map(value => {
        return this.softConfig.extractNumber(value) === originNumber && this.softConfig.isAtNumbering(value) === originIsAtNumbering
      })
      .reduce((previous, current) => {
        return previous || current
      }, false)
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
        (await this.statistics.getAllFilesForOneType(destIsAtNumbering)).map(file => {
          return this.softConfig.extractNumber(file)
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

    let currentMandatory = sameAtNumbering
      ? fileInfoArray.filter(f => f.mandatory)[0]
      : { fileNumber: null, newFileNumber: destNumber, mandatory: true }
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

    const toRenameFiles = (await this.statistics.getAllFilesForOneType(destIsAtNumbering))
      .filter(file => {
        const fileNumber = this.softConfig.extractNumber(file)
        return toMoveFiles.map(m => m.fileNumber).includes(fileNumber)
      })
      .map(file => {
        const fileNumber = this.softConfig.extractNumber(file)
        const mf = toMoveFiles.filter(m => m.fileNumber === fileNumber)[0]
        return { file, newFileNumber: mf.newFileNumber }
      })

    if (!sameAtNumbering) {
      const originFiles = (await this.statistics.getAllFilesForOneType(originIsAtNumbering)).filter(file => {
        return this.softConfig.extractNumber(file) === originNumber
      })

      for (const f of originFiles) {
        toRenameFiles.push({ file: f, newFileNumber: destNumber })
      }
    }

    cli.action.stop('done'.actionStopColor())
    cli.action.start('Moving files to temp directory'.actionStartColor())

    const { tempDir } = await this.fsUtils.getTempDir(this.softConfig.projectRootPath)

    try {
      const moveTempPromises: Promise<MoveSummary>[] = []
      for (const file of toRenameFiles.map(f => f.file)) {
        const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(file)
        const toFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, fromFilename))
        debug(`Original file: ${fromFilename} TEMP TO ${toFilename}`)

        // TODO: Use this.createSubDirectoryIfNecessary
        const directoryPath = path.dirname(path.join(tempDir, fromFilename))
        const directoryExists = await this.fsUtils.fileExists(directoryPath)
        if (!directoryExists) {
          try {
            await this.fsUtils.createDir(directoryPath)
          } catch {}
        }

        moveTempPromises.push(this.git.mv(fromFilename, toFilename))
      }
      await Promise.all(moveTempPromises)

      cli.action.stop(tempDir.actionStopColor())
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    cli.action.start('Moving files to their final states'.actionStartColor())
    let fileMovesPretty = ''

    try {
      const moveBackPromises: Promise<MoveSummary>[] = []
      for (const moveItem of toRenameFiles) {
        const filename = this.softConfig.mapFileToBeRelativeToRootPath(moveItem.file)
        const newFileNumber: number = moveItem.newFileNumber
        const destDigits = this.statistics.getMaxNecessaryDigits(destIsAtNumbering)

        const fromFilename = this.softConfig.mapFileToBeRelativeToRootPath(path.join(tempDir, filename))
        const toFilename = this.softConfig.renumberedFilename(filename, newFileNumber, destDigits, destIsAtNumbering)

        // TODO: Use this.createSubDirectoryIfNecessary
        const directoryPath = path.dirname(path.join(this.softConfig.projectRootPath, toFilename))
        const directoryExists = await this.fsUtils.fileExists(directoryPath)
        debug(`directoryPath=${directoryPath} directoryExists=${directoryExists}`)
        if (!directoryExists) {
          try {
            await this.fsUtils.createDir(directoryPath)
          } catch {}
        }

        debug(`TEMPed file: ${fromFilename} BACK TO ${toFilename}`)

        fileMovesPretty.concat(`\n    renaming from "${fromFilename}" to "${toFilename}"`)
        moveBackPromises.push(this.git.mv(fromFilename, toFilename))
      }
      await Promise.all(moveBackPromises)
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    await this.fsUtils.deleteEmptySubDirectories(this.softConfig.projectRootPath)

    cli.action.stop('done'.actionStopColor())

    const didAddDigits = await this.addDigitsToNecessaryStacks()

    let commitMessage = `Reordered files from ${(originIsAtNumbering ? '@' : '') + originNumber} to ${(destIsAtNumbering ? '@' : '') +
      destNumber}`
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
