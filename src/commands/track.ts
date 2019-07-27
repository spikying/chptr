import { cli } from 'cli-ux'
import * as path from 'path'

import { ChptrError } from '../chptr-error'
import { QueryBuilder } from '../ui-utils'

import { d } from './base'
import Command from './initialized-base'

const debug = d('track')

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
      const untrackedGitFiles = await this.gitUtils.GetGitListOfUntrackedFiles()
      let untrackedGitFilesFlat: string[] = []
      for (const utFile of untrackedGitFiles) {
        untrackedGitFilesFlat.push(...utFile.split('/'))
      }

      if (!untrackedGitFiles) {
        throw new ChptrError(`No file untracked by repository`, 'track.run', 17)
      }
      const root = this.rootPath

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

        const isInUntrackedFiles = untrackedGitFilesFlat.indexOf(path.basename(file)) >= 0

        debug(`isInUntrackedFiles? ${isInUntrackedFiles}`)
        return !isInUntrackedFiles
      }
      queryBuilder.add('filename', queryBuilder.fuzzyFilename(this.rootPath, toExcludeFiles, 'What file to track?'))
    }

    const queryResponses: any = await queryBuilder.responses()
    const filename = args.filename || queryResponses.filename || ''

    if (!filename) {
      throw new ChptrError('No filename to track', 'track.run', 22)
    }

    cli.action.start('Tracking file'.actionStartColor())

    const toCommitFiles = [this.softConfig.mapFileToBeRelativeToRootPath(filename)]

    await this.coreUtils.preProcessAndCommitFiles(`Tracking file ${filename}`, toCommitFiles)

    cli.action.stop('done'.actionStopColor())
  }

}
