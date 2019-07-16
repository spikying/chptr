import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
// import * as fs from 'fs'
import * as path from 'path'

import { Author } from '../config'
import { QueryBuilder } from '../queries'

import Command, { createDir, createFile, d, fileExists, sanitizeFileName } from './base'

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
      default: '',
      parse: sanitizeFileName
    }
  ]

  static strict = false

  static hidden = false

  // private flagForce = 'false'

  async run() {
    debug('Running Init command')
    const { args, flags } = this.parse(Init)
    // this.flagForce = flags.force || 'false'

    // Create folder structure, with /config
    try {
      await createDir(this.configInstance.configPath)
      cli.info(`Created directory ${this.configInstance.configPath.resultHighlighColor()}`.resultNormalColor())
    } catch {
      // If directory already exists, silently swallow the error
    }

    // Prompt config options if necessary
    const queryBuilder = new QueryBuilder()

    const forceConfigJson = flags.force === 'true' || flags.force === path.basename(this.configInstance.configFilePath)
    if (forceConfigJson || !(await fileExists(this.configInstance.configFilePath))) {
      const options: any = {
        name: {
          arg: args.name,
          query: queryBuilder.filename('What is the project working name?', 'MyNovel')
        },
        // gitRemote: {
        //   arg: flags.gitRemote,
        //   query: queryBuilder.gitremote()
        // },
        author: {
          arg: flags.author,
          query: queryBuilder.textinput('What is the name of the author?')
        },
        email: {
          arg: flags.email,
          query: queryBuilder.textinput('What is the email of the author?')
        },
        language: {
          arg: flags.language,
          query: queryBuilder.textinput('What language code do you use? (ex. en, fr, es...)')
        }
      }

      for (const opt of Object.keys(options)) {
        if (!options[opt].arg) {
          queryBuilder.add(opt, options[opt].query)
        }
      }
    }
    // if (!args.name) {
    //   queryBuilder.add('name', queryBuilder.filename('What is the project working name?', 'MyNovel'))
    // }
    // if (flags.gitRemote === undefined) {
    //   queryBuilder.add('gitRemote', queryBuilder.gitremote())
    // }
    // if (!flags.author) {
    //   queryBuilder.add('author', queryBuilder.textinput('What is the name of the author?'))
    // }
    // if (!flags.email) {
    //   queryBuilder.add('email', queryBuilder.textinput('What is the email of the author?'))
    // }
    // if (!flags.language) {
    //   queryBuilder.add('language', queryBuilder.textinput('What language code do you use? (ex. en, fr, es...)'))
    // }

    // const queryResponses: any = await queryBuilder.responses()

    // const name = args.name || queryResponses.name
    // const remoteRepo = flags.gitRemote || queryResponses.gitRemote || ''
    // const authorName = flags.author || queryResponses.author || ''
    // const authorEmail = flags.email || queryResponses.email || ''
    // const language = flags.language || queryResponses.language || 'en'

    // Create /config files

    //check if we prompt for gitRemote and keep doGitOperation=true
    let doGitOperation = true
    if (!flags.gitRemote) {
      const isRepoWithRemote =
        (await this.git.checkIsRepo()) &&
        (await this.git.getRemotes(false).then(result => {
          return result.find(value => value.name === 'origin') !== undefined
        }))

      const forceConfig = flags.force === 'true' || flags.force === 'gitRemote'
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
    const allConfigOperations = [
      {
        fullPathName: this.configInstance.configFilePath,
        content: this.configInstance.configDefaultsWithMetaString({
          projectTitle: name,
          projectAuthor: { name: authorName, email: authorEmail } as Author,
          projectLang: language
        })
      },
      {
        fullPathName: this.configInstance.emptyFilePath,
        content: this.configInstance.emptyFileString
      },
      {
        fullPathName: this.configInstance.readmeFilePath,
        content: `# ${name}\n\nA novel by ${authorName}.`
      },
      {
        fullPathName: this.configInstance.gitignoreFilePath,
        content: `build/
pandoc*/
*.antidote
`
      },
      {
        fullPathName: this.configInstance.gitattributesFilePath,
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
      const forceConfig = flags.force === 'true' || flags.force === path.basename(operation.fullPathName)
      if (!forceConfig && (await fileExists(operation.fullPathName))) {
        // cli.info(
        //   `${operation.fullPathName.resultNormalColor()} already exists.  Use option --force=${path.basename(
        //     operation.fullPathName
        //   )} to overwrite this one or -f, --force=true to overwrite all.`.infoColor()
        // )
        table.accumulator(
          `${operation.fullPathName.resultNormalColor()} already exists.`.infoColor(),
          `Use option --force=${path.basename(operation.fullPathName)} to overwrite this one or -f, --force=true to overwrite all.`.infoColor()
        )
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
        this.warn(err.errorColor())
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
          }
          if (didSyncRemote) {
            msg += `\n    synched remote`.resultNormalColor()
          }
        }
        cli.action.stop(msg.actionStopColor())
      }
    } else {
      const remote = (await this.git.getRemotes(true).then(result => {
        return result.find(value => value.name === 'origin')
      }))
      const remoteName = remote? remote.refs.fetch : ''
      table.accumulator(`git repository already exists with remote ${remoteName.resultNormalColor()}`.infoColor(),`Use option --force=gitRemote to overwrite this one or -f, --force=true to overwrite all.`.infoColor())
    }
    table.show()

    cli.info('End of initialization'.infoColor())
  }

  private async createFile(fullPathName: string, content: string) {
    // const forceAll = this.flagForce === 'true'
    // const baseName = path.basename(fullPathName)
    // const configForce = forceAll || this.flagForce === baseName
    // if (!configForce && fs.existsSync(fullPathName)) {
    //   if (this.flagForce === 'false') {
    //     this.warn(`${fullPathName} already exists.  Use option --force=${baseName} to overwrite this one or -f, --force=true to overwrite all.`)
    //   }
    // } else {
    try {
      // cli.action.start(`Creating ${baseName}`)
      await createFile(fullPathName, content)
    } catch (err) {
      this.error(err.toString().errorColor())
      this.exit(1)
    } finally {
      cli.info(`Created ${fullPathName.resultHighlighColor()}`.resultNormalColor())
    }
    // }
  }
}
