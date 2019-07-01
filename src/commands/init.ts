import { flags } from "@oclif/command";
import { cli } from "cli-ux";
// import * as d from "debug";
import * as fs from "fs";
import * as path from "path";
import * as simplegit from 'simple-git/promise';
// import { pathToFileURL } from 'url';
// import { promisify } from "util";

import { QueryBuilder } from "../common";
import { sanitizeFileName } from '../helpers';

import Command, { createDir, createFile, d } from "./base"

const debug = d("command:init");
// const createDir = promisify(fs.mkdir);
// const createFile = promisify(fs.writeFile);

export default class Init extends Command {
  // export default class Init extends Add {
  static description = "Generates basic config files for a new novel project";

  static flags = {
    ...Command.flags,
    digits: flags.string(
      {
        char: "d",
        default: "2",
        description: "Number of digits to use in file numbering initially.  Defaults to `2`."
      }),
    gitRemote: flags.string(
      {
        char: "r",
        required: false,
        description: "Git address of remote repository."
      }
    ),
    force: flags.string(
      {
        char: "f",
        description: "Overwrite config files if they exist.  Specify a filename to overwrite only one; write `true` to overwrite all.",
        default: 'false'
      }
    ),
    author: flags.string({
      char: "a",
      description: "Author of project"
    }),
    language: flags.string({
      char: "l",
      description: "Language of project"
    })
  };

  static args = [
    {
      name: "name",
      description: "Name of project",
      required: false,
      default: "",
      parse: sanitizeFileName
    }
  ];

  static strict = false

  private flagForce = 'false'

  async run() {
    const { args, flags } = this.parse(Init);

    const queryBuilder = new QueryBuilder()
    if (!args.name) {
      queryBuilder.add('name', queryBuilder.filename("What is the project working name?", "MyNovel"))
    }
    debug(`flags.gitRemote = ${flags.gitRemote}`)
    if (flags.gitRemote === undefined) {
      queryBuilder.add('gitRemote', queryBuilder.gitremote())
    }
    if (!flags.author) {
      queryBuilder.add('author', queryBuilder.textinput('What is the name of the author?'))
    }
    if (!flags.language) {
      queryBuilder.add('language', queryBuilder.textinput('What language code do you use? (ex. en, fr, es...)'))
    }
    debug(`before queryBuilder.responses()`)
    const queryResponses: any = await queryBuilder.responses()

    debug(`queryResponses = ${queryResponses}`)
    const name = args.name || queryResponses.name
    const remoteRepo = flags.gitRemote || queryResponses.gitRemote || ''
    const author = flags.author || queryResponses.author || ''
    const language = flags.language || queryResponses.language || 'en'

    // Create folder structure, with /config /chapters /characters /places /props /timeline
    debug("Before createDir");
    try {
      await createDir(this.configInstance.configPath);
      cli.info(`Created directory ${this.configInstance.configPath}`)
    } catch (err) {
      debug(err);
    }

    // Create /config files
    this.flagForce = flags.force || 'false'

    debug("After createDir, before createFile (config.json5)");

    const allConfigFiles = [
      {
        fullPathName: this.configInstance.configFilePath,
        content: this.configInstance.configDefaultsWithMetaString({ projectTitle: name, projectAuthor: author, projectLang: language })
      },
      {
        fullPathName: this.configInstance.emptyFilePath,
        content: this.configInstance.emptyFileString
      },
      {
        fullPathName: this.configInstance.readmeFilePath,
        content: `# ${name}\n\nA novel.`
      },
      {
        fullPathName: this.configInstance.gitignoreFilePath,
        content: `build/
pandoc*/
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
    const allConfigPromises: Promise<void>[] = []

    allConfigFiles.forEach(c => {
      allConfigPromises.push(this.createFile(c.fullPathName, c.content))
    })

    await Promise.all(allConfigPromises)

    // Create git repo
    try {
      cli.action.start('Creating git repository')

      const git = simplegit(this.configInstance.projectRootPath);
      const isRepo = await git.checkIsRepo()
      if (!isRepo) {
        await git.init()
      }

      await git.add('./*')
      await git.commit('Initial commit')

      const hasRemote: boolean = await git.getRemotes(false).then(result => {
        return result.find(value => value.name === 'origin') !== undefined
      })
      if (!hasRemote && remoteRepo) {

        debug(`adding remote to ${remoteRepo}`)
        await git.addRemote('origin', remoteRepo)
      }
      const hasRemote2: boolean = await git.getRemotes(false).then(result => {
        return result.find(value => value.name === 'origin') !== undefined
      })
      if (hasRemote2) {
        await git.pull('origin', 'master', { '--commit': null, '--allow-unrelated-histories': null })
        await git.push('origin', 'master', { '-u': null })
        await git.pull('origin', 'master')
      }

    } catch (err) {
      this.warn(err)
    } finally {
      cli.action.stop()
    }

    cli.info("End of initialization");
  }

  private async createFile(fullPathName: string, content: string) {
    const forceAll = this.flagForce === 'true'
    const baseName = path.basename(fullPathName)
    const configForce = forceAll || this.flagForce === baseName
    if (!configForce && fs.existsSync(fullPathName)) {
      if (this.flagForce === 'false') {
        this.warn(`${fullPathName} already exists.  Use option --force=${baseName} to overwrite this one or -f, --force=true to overwrite all.`);
      }
    } else {
      try {
        // cli.action.start(`Creating ${baseName}`)
        await createFile(
          fullPathName,
          content
        );
      } catch (err) {
        this.error(err);
        this.exit(1);
      } finally {
        cli.info(`Created ${fullPathName}`)
      }
    }

  }
}

