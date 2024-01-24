import { Args, ux } from '@oclif/core'
import * as path from 'node:path'

import { ChptrError } from '../shared/chptr-error'
import { QueryBuilder } from '../shared/ui-utils'
import BaseCommand, { d } from './base'
import { Container } from 'typescript-ioc'
import { GitUtils } from '../shared/git-utils'
import { CoreUtils } from '../shared/core-utils'
import { SoftConfig } from '../shared/soft-config'
// import Command from './initialized-base'

const debug = d('track')

export default class Track extends BaseCommand<typeof Track> {
  static args = {
    filename: Args.string({
      default: '',
      description: 'Filename to track',
      name: 'filename',
      required: false
    })
  }

  static description = 'Add a file to be tracked in repository that is not a chapter, summary or metadata file.'

  static flags = {}

  static hidden = false

  async run() {
    debug('Running Track command')
    const { args } = await this.parse(Track)

    const gitUtils = Container.get(GitUtils)
    const coreUtils = Container.get(CoreUtils)
    const softConfig = Container.get(SoftConfig)
    const root = Container.getValue('rootPath')

    const queryBuilder = new QueryBuilder(true)

    if (!args.filename) {
      const untrackedGitFiles = await gitUtils.GetGitListOfUntrackedFiles()
      const untrackedGitFilesFlat: string[] = []
      for (const utFile of untrackedGitFiles) {
        untrackedGitFilesFlat.push(...utFile.split('/'))
      }

      if (!untrackedGitFiles) {
        throw new ChptrError(`No file untracked by repository`, 'track.run', 17)
      }

      debug(`untrackedGitFiles=${JSON.stringify(untrackedGitFiles, null, 4)}`)
      const toExcludeFiles = function (file: string): boolean {
        // return TRUE to EXCLUDE file, FALSE to keep it
        debug(`In Exclude function for file ${file}`)
        const isRoot = file === root
        if (isRoot) {
          debug('isRoot')
          return false
        }

        const isGitDir = file.includes('.git')
        if (isGitDir) {
          debug('isGitDir')
          return true
        }

        const isInUntrackedFiles = untrackedGitFilesFlat.includes(path.basename(file))

        debug(`isInUntrackedFiles? ${isInUntrackedFiles}`)
        return !isInUntrackedFiles
      }

      queryBuilder.add('filename', queryBuilder.fuzzyFilename(root, toExcludeFiles, 'What file to track?'))
    }

    const queryResponses: any = await queryBuilder.responses()
    const filename = args.filename || queryResponses.filename || ''

    if (!filename) {
      throw new ChptrError('No filename to track', 'track.run', 22)
    }

    ux.action.start('Tracking file'.actionStartColor())

    const toCommitFiles = [softConfig.mapFileToBeRelativeToRootPath(filename)]

    await coreUtils.preProcessAndCommitFiles(`Tracking file ${filename}`, toCommitFiles)

    ux.action.stop('done'.actionStopColor())
  }
}
