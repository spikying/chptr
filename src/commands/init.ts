import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import * as fs from 'fs'
import * as path from 'path'

import { Author } from '../config'
import { QueryBuilder } from '../queries'

import Command, { createDir, createFile, d, sanitizeFileName } from './base'

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
      description: 'Git address of remote repository.',
    }),
    force: flags.string({
      char: 'f',
      description: 'Overwrite config files if they exist.  Specify a filename to overwrite only one; write `true` to overwrite all.',
      default: 'false',
    }),
    author: flags.string({
      char: 'a',
      description: 'Name of author of project',
    }),
    email: flags.string({
      char: 'e',
      description: 'Email of author of project',
    }),
    language: flags.string({
      char: 'l',
      description: 'Language of project',
    }),
  }

  static args = [
    {
      name: 'name',
      description: 'Name of project',
      required: false,
      default: '',
      parse: sanitizeFileName,
    },
  ]

  static strict = false

  static hidden = false

  private flagForce = 'false'

  async run() {
    debug('Running Init command')
    const { args, flags } = this.parse(Init)

    const queryBuilder = new QueryBuilder()
    if (!args.name) {
      queryBuilder.add('name', queryBuilder.filename('What is the project working name?', 'MyNovel'))
    }
    if (flags.gitRemote === undefined) {
      queryBuilder.add('gitRemote', queryBuilder.gitremote())
    }
    if (!flags.author) {
      queryBuilder.add('author', queryBuilder.textinput('What is the name of the author?'))
    }
    if (!flags.email) {
      queryBuilder.add('email', queryBuilder.textinput('What is the email of the author?'))
    }
    if (!flags.language) {
      queryBuilder.add('language', queryBuilder.textinput('What language code do you use? (ex. en, fr, es...)'))
    }
    const queryResponses: any = await queryBuilder.responses()

    const name = args.name || queryResponses.name
    const remoteRepo = flags.gitRemote || queryResponses.gitRemote || ''
    const authorName = flags.author || queryResponses.author || ''
    const authorEmail = flags.email || queryResponses.email || ''
    const language = flags.language || queryResponses.language || 'en'

    // Create folder structure, with /config
    try {
      await createDir(this.configInstance.configPath)
      cli.info(`Created directory ${this.configInstance.configPath}`.infoColor())
    } catch {
      // If directory already exists, silently swallow the error
    }

    // Create /config files
    this.flagForce = flags.force || 'false'

    const allConfigFiles = [
      {
        fullPathName: this.configInstance.configFilePath,
        content: this.configInstance.configDefaultsWithMetaString({
          projectTitle: name,
          projectAuthor: { name: authorName, email: authorEmail } as Author,
          projectLang: language,
        }),
      },
      {
        fullPathName: this.configInstance.emptyFilePath,
        content: this.configInstance.emptyFileString,
      },
      {
        fullPathName: this.configInstance.readmeFilePath,
        content: `# ${name}\n\nA novel.`,
      },
      {
        fullPathName: this.configInstance.gitignoreFilePath,
        content: `build/
pandoc*/
`,
      },
      {
        fullPathName: this.configInstance.gitattributesFilePath,
        content: `autocrlf=false
eol=lf
* text=auto
`,
      },
    ]
    const allConfigPromises: Promise<void>[] = []

    allConfigFiles.forEach(c => {
      allConfigPromises.push(this.createFile(c.fullPathName, c.content))
    })

    await Promise.all(allConfigPromises)

    // Create git repo
    try {
      cli.action.start('Creating git repository'.actionStartColor())

      const isRepo = await this.git.checkIsRepo()
      if (!isRepo) {
        await this.git.init()
      }

      await this.git.add('./*')
      await this.git.commit('Initial commit')

      const hasRemote: boolean = await this.git.getRemotes(false).then(result => {
        return result.find(value => value.name === 'origin') !== undefined
      })
      if (!hasRemote && remoteRepo) {
        await this.git.addRemote('origin', remoteRepo)
      }
      const hasRemote2: boolean = await this.git.getRemotes(false).then(result => {
        return result.find(value => value.name === 'origin') !== undefined
      })
      if (hasRemote2) {
        await this.git.pull('origin', 'master', { '--commit': null, '--allow-unrelated-histories': null })
        await this.git.push('origin', 'master', { '-u': null })
        await this.git.pull('origin', 'master')
      }
    } catch (err) {
      this.warn(err.errorColor())
    } finally {
      cli.action.stop('done'.actionStopColor())
    }

    cli.info('End of initialization'.infoColor())
  }

  private async createFile(fullPathName: string, content: string) {
    const forceAll = this.flagForce === 'true'
    const baseName = path.basename(fullPathName)
    const configForce = forceAll || this.flagForce === baseName
    if (!configForce && fs.existsSync(fullPathName)) {
      if (this.flagForce === 'false') {
        this.warn(`${fullPathName} already exists.  Use option --force=${baseName} to overwrite this one or -f, --force=true to overwrite all.`)
      }
    } else {
      try {
        // cli.action.start(`Creating ${baseName}`)
        await createFile(fullPathName, content)
      } catch (err) {
        this.error(err.toString().errorColor())
        this.exit(1)
      } finally {
        cli.info(`Created ${fullPathName}`.infoColor())
      }
    }
  }
}
