import { flags } from '@oclif/command'
import { CLIError } from '@oclif/errors'
import { cli } from 'cli-ux'
import * as path from 'path'
import * as validator from 'validator'

import { Author, SoftConfig } from '../soft-config'
import { QueryBuilder, tableize } from '../ui-utils'

import Command, { d } from './base'

const debug = d('command:init')

export default class Init extends Command {
  static description = 'Generates basic config files for a new novel project'

  static flags = {
    ...Command.flags,
    gitRemote: flags.string({
      char: 'r',
      required: false,
      description: 'Git address of remote repository.'
    }),
    force: flags.string({
      char: 'f',
      description: 'Overwrite config files if they exist.  Specify a filename to overwrite only one; write `true` to overwrite all.',
      default: 'false'
    }),
    author: flags.string({
      char: 'a',
      description: 'Name of author of project'
    }),
    email: flags.string({
      char: 'e',
      description: 'Email of author of project'
    }),
    language: flags.string({
      char: 'l',
      description: 'Language of project'
    }),
    style: flags.string({
      char: 's',
      description: 'Config files in JSON5 or YAML?',
      parse: input => {
        let ucased = input.toUpperCase()
        if (ucased === 'JSON') {
          ucased = 'JSON5'
        }
        if (ucased === 'YAML' || ucased === 'JSON5' || ucased === '') {
          return ucased
        } else {
          throw new CLIError('Expected `style` flag to be one of: YAML, JSON5')
        }
      },
      // options: ['YAML', 'JSON5', ''],
      default: ''
    })
  }

  static args = [
    {
      name: 'name',
      description: 'Name of project',
      required: false,
      default: ''
      // parse: sanitizeFileName
    }
  ]

  static strict = false

  static hidden = false

  static aliases = ['setup']
  // private flagForce = 'false'

  async run() {
    debug('Running Init command')
    const { args, flags } = this.parse(Init)

    const force = flags.force
    const forceAll = force === 'true' || force === 'all'

    // Create folder structure, with /config
    try {
      await this.fsUtils.createDir(this.hardConfig.configPath)
      cli.info(`Created directory ${this.hardConfig.configPath.resultHighlighColor()}`.resultNormalColor())
    } catch {
      // If directory already exists, silently swallow the error
    }

    // Prompt config options if necessary
    const queryBuilder = new QueryBuilder()

    const forceConfigFile =
      forceAll ||
      force === path.basename(this.hardConfig.configJSON5FilePath) ||
      force === path.basename(this.hardConfig.configYAMLFilePath)

    const notEmptyString = function(val: string): string {
      if (!val) {
        throw new CLIError('Must not be empty')
      } else {
        return val
      }
    }
    const emailString = function(val: string): string {
      if (!validator.isEmail(val)) {
        throw new CLIError('Must be an email address')
      } else {
        return val
      }
    }

    const hasYAMLConfigFile = await this.fsUtils.fileExists(this.hardConfig.configYAMLFilePath)
    const hasJSON5ConfigFile = await this.fsUtils.fileExists(this.hardConfig.configJSON5FilePath)
    let existingStyle = ''
    if (hasJSON5ConfigFile) {
      existingStyle = 'JSON5'
    } else if (hasYAMLConfigFile) {
      existingStyle = 'YAML'
    } else if (!flags.style) {
      queryBuilder.add('style', queryBuilder.list(['JSON5', 'YAML'], 'Choose a config file style.', 'JSON5'))
    }

    if (forceConfigFile || (!hasYAMLConfigFile && !hasJSON5ConfigFile)) {
      const options: any = {
        name: {
          arg: args.name,
          query: queryBuilder.textinput('What is the project working name?', 'MyNovel', notEmptyString)
        },
        author: {
          arg: flags.author,
          query: queryBuilder.textinput('What is the name of the author?', undefined, notEmptyString)
        },
        email: {
          arg: flags.email,
          query: queryBuilder.textinput('What is the email of the author?', undefined, emailString)
        },
        language: {
          arg: flags.language,
          query: queryBuilder.textinput('What language code do you use? (ex. en, fr, es...)', 'en')
        }
      }

      for (const opt of Object.keys(options)) {
        if (!options[opt].arg) {
          queryBuilder.add(opt, options[opt].query)
        }
      }
    }

    //check if we prompt for gitRemote and keep doGitOperation=true
    let doGitOperation = true
    if (!flags.gitRemote) {
      const isRepoWithRemote =
        (await this.git.checkIsRepo()) &&
        (await this.git.getRemotes(false).then(result => {
          return result.find(value => value.name === 'origin') !== undefined
        }))

      const forceConfig = forceAll || force === 'gitRemote'
      if (!isRepoWithRemote || forceConfig) {
        queryBuilder.add('gitRemote', queryBuilder.gitremote())
      } else {
        doGitOperation = false
      }
    }

    //do prompt what's necessary
    const queryResponses: any = await queryBuilder.responses()

    const name = args.name || queryResponses.name
    const remoteRepo = flags.gitRemote || queryResponses.gitRemote || ''
    const authorName = flags.author || queryResponses.author || ''
    const authorEmail = flags.email || queryResponses.email || ''
    const language = flags.language || queryResponses.language || 'en'
    const style = existingStyle || flags.style || queryResponses.style

    //prepare for creating config files

    const virginSoftConfig = new SoftConfig(path.join(flags.path as string), false)
    virginSoftConfig.configStyle = style

    const overrideObj = {
      projectTitle: name,
      projectAuthor: { name: authorName, email: authorEmail } as Author,
      projectLang: language
    }

    const allConfigOperations = [
      {
        fullPathName: this.hardConfig.emptyFilePath,
        content: this.hardConfig.templateEmptyFileString
      },
      {
        fullPathName: this.hardConfig.readmeFilePath,
        content: `\n# ${name}\n\nA novel by ${authorName}.` // can't be moved to HardConfig because it depends on not-yet-initialized soft config values
      },
      {
        fullPathName: this.hardConfig.gitignoreFilePath,
        content: this.hardConfig.templateGitignoreString
      },
      {
        fullPathName: this.hardConfig.gitattributesFilePath,
        content: this.hardConfig.templateGitattributesString
      }
    ]

    debug(`before style operations`)
    if (style === 'YAML') {
      allConfigOperations.push(
        {
          fullPathName: this.hardConfig.configYAMLFilePath,
          content: virginSoftConfig.configDefaultsWithMetaYAMLString(overrideObj)
        },
        {
          fullPathName: this.hardConfig.metadataFieldsYAMLFilePath,
          content: this.hardConfig.metadataFieldsDefaultsYAMLString
        }
      )
    } else if (style === 'JSON5') {
      allConfigOperations.push(
        {
          fullPathName: this.hardConfig.configJSON5FilePath,
          content: virginSoftConfig.configDefaultsWithMetaJSON5String(overrideObj)
        },
        {
          fullPathName: this.hardConfig.metadataFieldsJSON5FilePath,
          content: this.hardConfig.metadataFieldsDefaultsJSONString
        }
      )
    } else {
      throw new CLIError('Config style must be JSON5 or YAML')
    }

    debug(`before file validation and creation`)

    //validate which config files to create and create them
    // const allConfigFiles: { fullPathName: string; content: string }[] = []
    const table = tableize('file', '')
    const allConfigPromises: Promise<void>[] = []

    for (const operation of allConfigOperations) {
      const forceConfig = forceAll || force === path.basename(operation.fullPathName)
      if (!forceConfig && (await this.fsUtils.fileExists(operation.fullPathName))) {
        if (!force) {
          table.accumulator(
            `${operation.fullPathName.resultNormalColor()} already exists.`.infoColor(),
            `Use option --force=${path.basename(
              operation.fullPathName
            )} to overwrite this one or -f, --force=true to overwrite all.`.infoColor()
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
        cli.action.start('Working on git repository'.actionStartColor())

        const isRepo = await this.git.checkIsRepo()
        if (!isRepo) {
          await this.git.init()
          await this.git.add('./*')
          await this.git.commit('Initial commit')
          didGitInit = true
        }

        const hasRemote: boolean = await this.git.getRemotes(false).then(result => {
          return result.find(value => value.name === 'origin') !== undefined
        })
        if (!hasRemote && remoteRepo) {
          await this.git.addRemote('origin', remoteRepo)
          didAddRemote = true
        }
        const hasRemote2: boolean = await this.git.getRemotes(false).then(result => {
          return result.find(value => value.name === 'origin') !== undefined
        })
        if (hasRemote2) {
          await this.git.pull('origin', 'master', { '--commit': null, '--allow-unrelated-histories': null })
          await this.git.push('origin', 'master', { '-u': null })
          await this.git.pull('origin', 'master')
          didSyncRemote = true
        }
      } catch (err) {
        this.warn(err.toString().errorColor())
      } finally {
        let msg = ''
        if (!didGitInit && !didAddRemote && !didSyncRemote) {
          msg = 'no remote was supplied'
        } else {
          if (didGitInit) {
            msg += `\n    initialized repo`.resultNormalColor()
          }
          if (didAddRemote) {
            msg += `\n    added remote ${remoteRepo.resultHighlighColor()}`.resultNormalColor()
          } else {
            msg += `\n    no remote added`.resultHighlighColor()
          }
          if (didSyncRemote) {
            msg += `\n    synched remote`.resultNormalColor()
          }
        }
        cli.action.stop(msg.actionStopColor())
      }
    } else {
      // show why remote was not updated
      const remote = await this.git.getRemotes(true).then(result => {
        return result.find(value => value.name === 'origin')
      })
      const remoteName = remote ? remote.refs.fetch : ''
      table.accumulator(
        `git repository already exists with remote ${remoteName.resultNormalColor()}`.infoColor(),
        `Use option --force=gitRemote to overwrite this one or -f, --force=true to overwrite all.`.infoColor()
      )
    }
    table.show('Init operations not done')

    //save other created files
    await this.git.add('./**/*.*')
    const commitSummary = await this.git.commit('Init command has created some new files')
    if (commitSummary.commit) {
      cli.info(`Commited all available files ${commitSummary.commit.resultHighlighColor()}`)
    }

    cli.info('End of initialization'.infoColor())
  }
}
