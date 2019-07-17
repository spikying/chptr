import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
// import * as fs from 'fs'
import * as path from 'path'
import * as validator from 'validator'

import { Author, Config } from '../config'
import { QueryBuilder } from '../queries'

import Command, { createDir, d, fileExists } from './base'

const debug = d('command:init')

export default class Init extends Command {
  static description = 'Generates basic config files for a new novel project'

  static flags = {
    ...Command.flags,
    // digits: flags.string({
    //   char: 'd',
    //   default: '2',
    //   description: 'Number of digits to use in file numbering initially.  Defaults to `2`.',
    // }),
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

  // private flagForce = 'false'

  async run() {
    debug('Running Init command')
    const { args, flags } = this.parse(Init)

    const force = flags.force
    const forceAll = force === 'true' || force === 'all'

    // Create folder structure, with /config
    try {
      await createDir(this.hardConfig.configPath)
      cli.info(`Created directory ${this.hardConfig.configPath.resultHighlighColor()}`.resultNormalColor())
    } catch {
      // If directory already exists, silently swallow the error
    }

    // Prompt config options if necessary
    const queryBuilder = new QueryBuilder()

    const forceConfigJson = forceAll || force === path.basename(this.hardConfig.configFilePath)
    const notEmptyString = function(val: string): string {
      if (!val) {
        throw new Error('Must not be empty')
      } else {
        return val
      }
    }
    const emailString = function(val: string): string {
      if (!validator.isEmail(val)) {
        throw new Error('Must be an email address')
      } else {
        return val
      }
    }
    if (forceConfigJson || !(await fileExists(this.hardConfig.configFilePath))) {
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

    //prepare for creating config files

    //TODO : VirginConfigInstance's essentials could be moved to HardConfig?
    const virginConfigInstance = new Config(path.join(flags.path as string), false)
    const allConfigOperations = [
      {
        fullPathName: this.hardConfig.configFilePath,
        content: virginConfigInstance.configDefaultsWithMetaString({
          projectTitle: name,
          projectAuthor: { name: authorName, email: authorEmail } as Author,
          projectLang: language
        })
      },
      {
        fullPathName: this.hardConfig.emptyFilePath,
        content: this.hardConfig.emptyFileString
      },
      {
        fullPathName: this.hardConfig.readmeFilePath,
        content: `# ${name}\n\nA novel by ${authorName}.`
      },
      {
        fullPathName: this.hardConfig.gitignoreFilePath, //todo: move content to HardConfig
        content: `build/
pandoc*/
*.antidote
`
      },
      {
        fullPathName: this.hardConfig.gitattributesFilePath, //todo: move content to HardConfig
        content: `autocrlf=false
eol=lf
* text=auto
`
      }
    ]

    //validate which config files to create
    const allConfigFiles: { fullPathName: string; content: string }[] = []
    const table = this.tableize('file', '')
    for (const operation of allConfigOperations) {
      const forceConfig = forceAll || force === path.basename(operation.fullPathName)
      if (!forceConfig && (await fileExists(operation.fullPathName))) {
        if (!force) {
          table.accumulator(
            `${operation.fullPathName.resultNormalColor()} already exists.`.infoColor(),
            `Use option --force=${path.basename(operation.fullPathName)} to overwrite this one or -f, --force=true to overwrite all.`.infoColor()
          )
        }
      } else {
        allConfigFiles.push(operation)
      }
    }

    //create files that were validated
    const allConfigPromises: Promise<void>[] = []
    allConfigFiles.forEach(cf => {
      allConfigPromises.push(this.createFile(cf.fullPathName, cf.content))
    })
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

    cli.info('End of initialization'.infoColor())
  }
}
