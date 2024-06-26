import { Args, Flags, ux } from '@oclif/core'
import * as path from 'node:path'
import { SimpleGit } from 'simple-git'
import * as validator from 'validator'
import { Container } from 'typescript-ioc'
import { ChptrError } from '../shared/chptr-error'
import { actionStartColor, actionStopColor, errorColor, infoColor, resultHighlighColor, resultNormalColor } from '../shared/colorize'
import { FsUtils } from '../shared/fs-utils'
import { HardConfig } from '../shared/hard-config'
import { Author, SoftConfig } from '../shared/soft-config'
import { QueryBuilder, tableize } from '../shared/ui-utils'
import BaseCommand, { d } from './base'

const debug = d('command:init')

export default class Init extends BaseCommand<typeof Init> {
  static aliases = ['setup']
  static args = {
    name: Args.string({
      default: '',
      description: 'Name of project',
      name: 'name',
      required: false
      // parse: sanitizeFileName
    })
  }

  static description = 'Generates basic config files for a new novel project'

  static readonly directoryStructureList = [
    { chapterPattern: 'NUM NAME.chptr', id: '/', metadataPattern: 'NUM.metadata.<ext>', summaryPattern: 'NUM.summary.md' },
    {
      chapterPattern: 'chapters/NUM NAME.chptr',
      id: 'chapters/',
      metadataPattern: 'chapters/NUM.metadata.<ext>',
      summaryPattern: 'chapters/NUM.summary.md'
    },
    {
      chapterPattern: 'chapters/NUM NAME/chptr.md',
      id: 'chapters/number/',
      metadataPattern: 'chapters/NUM NAME/metadata.<ext>',
      summaryPattern: 'chapters/NUM NAME/summary.md'
    }
  ]

  static readonly directoryStructureOptions = Init.directoryStructureList.map(d => d.id)

  static flags = {
    author: Flags.string({
      char: 'a',
      description: 'Name of author of project'
    }),
    directorystructure: Flags.string({
      char: 'd',
      default: '',
      description: 'Directory structure initially written in config file',
      options: [...Init.directoryStructureOptions, '']
    }),
    email: Flags.string({
      char: 'e',
      description: 'Email of author of project'
    }),
    force: Flags.string({
      char: 'f',
      default: 'false',
      description: 'Overwrite config files if they exist.  Specify a filename to overwrite only one; write `true` to overwrite all.'
    }),
    gitRemote: Flags.string({
      char: 'r',
      description: 'Git address of remote repository.',
      required: false
    }),
    language: Flags.string({
      char: 'l',
      description: 'Language of project'
    }),
    style: Flags.string({
      char: 's',
      // options: ['YAML', 'JSON5', ''],
      default: '',
      description: 'Config files in JSON5 or YAML?',
      async parse(input) {
        let ucased = input.toUpperCase()
        if (ucased === 'JSON') {
          ucased = 'JSON5'
        }

        if (ucased === 'YAML' || ucased === 'JSON5' || ucased === '') {
          return ucased
        }

        throw new ChptrError('Expected `style` flag to be one of: YAML, JSON5', 'init:flags', 5)
      }
    })
  }

  static hidden = false

  static strict = false
  // private flagForce = 'false'

  private fsUtils: FsUtils = Container.get(FsUtils)
  
  async run() {
    debug('Running Init command')
    const git: SimpleGit = Container.getValue('git') as SimpleGit
    const hardConfig: HardConfig = Container.get(HardConfig)
    // const { args, flags } = await this.parse(Init)

    const { force } = this.flags
    const forceAll = force === 'true' || force === 'all'

    // Create folder structure, with /config
    try {
      const madeDir = await this.fsUtils.createSubDirectoryFromDirectoryPathIfNecessary(hardConfig.configPath)

      if (madeDir) {
        ux.info(resultNormalColor(`Created directory ${resultHighlighColor(hardConfig.configPath)}`))
      }
    } catch (error) {
      // If directory already exists, silently swallow the error
      debug(error)
    }

    // Prompt config options if necessary
    const queryBuilder = new QueryBuilder()

    const forceConfigFile =
      forceAll ||
      force === path.basename(hardConfig.configJSON5FilePath) ||
      force === path.basename(hardConfig.configYAMLFilePath)

    const notEmptyString = function (val: string): string {
      if (val) {
        return val
      }

      throw new ChptrError('Must not be empty', 'init.run.notemptystring', 6)
    }

    const emailString = function (val: string): string {
      if (validator.default.isEmail(val)) {
        return val
      }

      throw new ChptrError('Must be an email address', 'init.run.emailstring', 7)
    }

    const hasYAMLConfigFile = await this.fsUtils.fileExists(hardConfig.configYAMLFilePath)
    const hasJSON5ConfigFile = await this.fsUtils.fileExists(hardConfig.configJSON5FilePath)
    let existingStyle = ''
    if (hasJSON5ConfigFile) {
      existingStyle = 'JSON5'
    } else if (hasYAMLConfigFile) {
      existingStyle = 'YAML'
    } else if (!this.flags.style) {
      queryBuilder.add('style', queryBuilder.list(['JSON5', 'YAML'], 'Choose a config file style.', 'JSON5'))
    }

    if (forceConfigFile || (!hasYAMLConfigFile && !hasJSON5ConfigFile)) {
      const options: any = {
        author: {
          arg: this.flags.author,
          query: queryBuilder.textinput('What is the name of the author?', undefined, notEmptyString)
        },
        directorystructure: {
          arg: this.flags.directorystructure,
          query: queryBuilder.list(Init.directoryStructureOptions, 'What directory structure do you initially want?', 'chapters/')
        },
        email: {
          arg: this.flags.email,
          query: queryBuilder.textinput('What is the email of the author?', undefined, emailString)
        },
        language: {
          arg: this.flags.language,
          query: queryBuilder.textinput('What language code do you use? (ex. en, fr, es...)', 'en')
        },
        name: {
          arg: this.args.name,
          query: queryBuilder.textinput('What is the project working name?', 'MyNovel', notEmptyString)
        }
      }

      for (const opt of Object.keys(options)) {
        if (!options[opt].arg) {
          queryBuilder.add(opt, options[opt].query)
        }
      }
    }

    // check if we prompt for gitRemote and keep doGitOperation=true
    let doGitOperation = true
    if (!this.flags.gitRemote) {
      const isRepoWithRemote =
        (await git.checkIsRepo()) &&
        (await git.getRemotes(false).then((result: any[]) => result.find(value => value.name === 'origin') !== undefined))

      const forceConfig = forceAll || force === 'gitRemote'
      if (!isRepoWithRemote || forceConfig) {
        queryBuilder.add('gitRemote', queryBuilder.gitremote())
      } else {
        doGitOperation = false
      }
    }

    // do prompt what's necessary
    const queryResponses: any = await queryBuilder.responses()

    const name = this.args.name || queryResponses.name
    const remoteRepo = this.flags.gitRemote || queryResponses.gitRemote || ''
    const authorName = this.flags.author || queryResponses.author || ''
    const authorEmail = this.flags.email || queryResponses.email || ''
    const language = this.flags.language || queryResponses.language || 'en'
    const style = existingStyle || this.flags.style || queryResponses.style
    const directorystructure = this.flags.directorystructure || queryResponses.directorystructure

    // prepare for creating config files

    const virginSoftConfig = new SoftConfig(false)
    virginSoftConfig.configStyle = style

    const directoryOverrides = Init.directoryStructureList.find(dsl => dsl.id === directorystructure)

    const overrideObj = {
      projectAuthor: { email: authorEmail, name: authorName } as Author,
      projectLang: language,
      projectTitle: name,
      ...directoryOverrides
    }

    const allConfigOperations = [
      {
        content: hardConfig.templateEmptyFileString,
        fullPathName: hardConfig.emptyFilePath
      },
      {
        content: `\n# ${name}\n\nA novel by ${authorName}.`, // can't be moved to HardConfig because it depends on not-yet-initialized soft config values
        fullPathName: hardConfig.readmeFilePath
      },
      {
        content: hardConfig.templateGitignoreString,
        fullPathName: hardConfig.gitignoreFilePath
      },
      {
        content: hardConfig.templateGitattributesString,
        fullPathName: hardConfig.gitattributesFilePath
      }
    ]

    debug(`before style operations`)
    if (style === 'YAML') {
      allConfigOperations.push(
        {
          content: virginSoftConfig.configDefaultsWithMetaYAMLString(overrideObj),
          fullPathName: hardConfig.configYAMLFilePath
        },
        {
          content: hardConfig.metadataFieldsDefaultsYAMLString,
          fullPathName: hardConfig.metadataFieldsYAMLFilePath
        }
      )
    } else if (style === 'JSON5') {
      allConfigOperations.push(
        {
          content: virginSoftConfig.configDefaultsWithMetaJSON5String(overrideObj),
          fullPathName: hardConfig.configJSON5FilePath
        },
        {
          content: hardConfig.metadataFieldsDefaultsJSONString,
          fullPathName: hardConfig.metadataFieldsJSON5FilePath
        }
      )
    } else {
      throw new ChptrError('Config style must be JSON5 or YAML', 'init.run', 8)
    }

    debug(`before file validation and creation`)

    // validate which config files to create and create them
    // const allConfigFiles: { fullPathName: string; content: string }[] = []
    const table = tableize('file', '')
    const allConfigPromises: Promise<void>[] = []

    for (const operation of allConfigOperations) {
      const forceConfig = forceAll || force === path.basename(operation.fullPathName)
      if (!forceConfig && (await this.fsUtils.fileExists(operation.fullPathName))) {
        if (!force) {
          table.accumulator(
            infoColor(`${resultNormalColor(operation.fullPathName)} already exists.`),
            infoColor(`Use option --force=${path.basename(
              operation.fullPathName
            )} to overwrite this one or -f, --force=true to overwrite all.`)
          )
        }
      } else {
        // allConfigFiles.push(operation)
        allConfigPromises.push(this.fsUtils.createFile(operation.fullPathName, operation.content))
      }
    }

    // //create files that were validated
    // allConfigFiles.forEach(cf => {
    //   allConfigPromises.push(this.fsUtils.createFile(cf.fullPathName, cf.content))
    // })
    await Promise.all(allConfigPromises)

    // Create git repo and remote if validated
    if (doGitOperation) {
      let didGitInit = false
      let didAddRemote = false
      let didSyncRemote = false

      try {
        ux.action.start(actionStartColor('Working on git repository'))

        const isRepo = await git.checkIsRepo()
        if (!isRepo) {
          await git.init()
          await git.add('./*')
          await git.commit('Initial commit')
          didGitInit = true
        }

        const hasRemote: boolean = await git
          .getRemotes(false)
          .then((result: any[]) => result.find(value => value.name === 'origin') !== undefined)
        if (!hasRemote && remoteRepo) {
          await git.addRemote('origin', remoteRepo)
          didAddRemote = true
        }

        const hasRemote2: boolean = await git
          .getRemotes(false)
          .then((result: any[]) => result.find(value => value.name === 'origin') !== undefined)
        if (hasRemote2) {
          await git.pull('origin', 'master', { '--allow-unrelated-histories': null, '--commit': null })
          await git.push('origin', 'master', { '-u': null })
          await git.pull('origin', 'master')
          didSyncRemote = true
        }
      } catch (error: any) {
        this.warn(errorColor(error.toString()))
      } finally {
        let msg = ''
        if (!didGitInit && !didAddRemote && !didSyncRemote) {
          msg = 'no remote was supplied'
        } else {
          if (didGitInit) {
            msg += resultNormalColor(`\n    initialized repo`)
          }

          msg += didAddRemote
            ? resultNormalColor(`\n    added remote ${remoteRepo.resultHighlighColor()}`)
            : resultHighlighColor(`\n    no remote added`)
          if (didSyncRemote) {
            msg += resultNormalColor(`\n    synched remote`)
          }
        }

        ux.action.stop(actionStopColor(msg))
      }
    } else {
      // show why remote was not updated
      const remote = await git.getRemotes(true).then((result: any[]) => result.find(value => value.name === 'origin'))
      const remoteName = remote ? remote.refs.fetch : ''
      table.accumulator(
        infoColor(`git repository already exists with remote ${remoteName.resultNormalColor()}`),
        infoColor(`Use option --force=gitRemote to overwrite this one or -f, --force=true to overwrite all.`)
      )
    }

    table.show('Init operations not done')

    // save other created files
    await git.add('./**/*.*')
    const commitSummary = await git.commit('Init command has created some new files')
    if (commitSummary.commit) {
      ux.info(`Commited all available files ${resultHighlighColor(commitSummary.commit)}`)
    }

    ux.info(infoColor('End of initialization'))
  }
}
