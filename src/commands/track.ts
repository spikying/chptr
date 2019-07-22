import { cli } from 'cli-ux'
import * as path from 'path'

import { QueryBuilder } from '../queries'

import { d } from './base'
import Command from './initialized-base'

const debug = d('command:track')

export default class Track extends Command {
  static description = 'Add a file to be tracked in repository that is not a chapter, summary or metadata file.'

  static flags = {
    ...Command.flags
  }

  static args = [
    {
      name: 'filename',
      description: 'Filename to track',
      required: false,
      default: ''
    }
  ]

  static hidden = false

  async run() {
    debug('Running Track command')
    const { args } = this.parse(Track)

    const queryBuilder = new QueryBuilder(true)

    if (!args.filename) {
      const untrackedGitFiles = await this.GetGitListOfUntrackedFiles()
      let untrackedGitFilesFlat: string[] = []
      for (const utFile of untrackedGitFiles) {
        untrackedGitFilesFlat.push(...utFile.split('/'))
      }

      if (!untrackedGitFiles) {
        cli.error(`No file untracked by repository`)
        cli.exit(0)
      }
      const root = this.configInstance.projectRootPath

      debug(`untrackedGitFiles=${JSON.stringify(untrackedGitFiles, null, 4)}`)
      const toExcludeFiles = function(file: string): boolean {
        // return TRUE to EXCLUDE file, FALSE to keep it
        debug(`In Exclude function for file ${file}`)
        const isRoot = file === root
        if (isRoot) {
          debug('isRoot')
          return false
        }

        const isGitDir = file.indexOf('.git') >= 0
        if (isGitDir) {
          debug('isGitDir')
          return true
        }

        // debug(`untrackedGitFilesFlat=${untrackedGitFilesFlat}`)
        // debug(`map function = ${mapFile}`)
        // debug(`mappedFile = ${path.basename(file)}`)
        const isInUntrackedFiles = untrackedGitFilesFlat.indexOf(path.basename(file)) >= 0
        // .map(unTrackedFile => {
        //   return unTrackedFile === mapFile(file)
        // })
        // .reduce((previous, current) => {
        //   return previous && current
        // }, false)
        debug(`isInUntrackedFiles? ${isInUntrackedFiles}`)
        return !isInUntrackedFiles
      }
      queryBuilder.add('filename', queryBuilder.fuzzyFilename(this.configInstance.projectRootPath, toExcludeFiles, 'What file to track?'))
    }

    const queryResponses: any = await queryBuilder.responses()
    const filename = args.filename || queryResponses.filename || ''

    if (!filename) {
      this.error('No filename to track'.errorColor())
      this.exit(0)
    }

    cli.action.start('Tracking file'.actionStartColor())

    const toCommitFiles = [this.configInstance.mapFileToBeRelativeToRootPath(filename)]

    await this.CommitToGit(`Tracking file ${filename}`, toCommitFiles)

    cli.action.stop('done'.actionStopColor())
  }

  private async GetGitListOfUntrackedFiles(): Promise<string[]> {
    const gitStatus = await this.git.status()

    const unQuote = function(value: string) {
      if (!value) {
        return value
      }
      return value.replace(/"(.*)"/, '$1')
    }

    return gitStatus.not_added.map(unQuote).filter(val => val !== '')
  }
}
