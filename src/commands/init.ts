import { flags } from "@oclif/command";
import { cli } from "cli-ux";
import * as d from "debug";
import * as fs from "fs";
import * as simplegit from 'simple-git/promise';
import { promisify } from "util";

import { QueryBuilder } from "../common";
import { sanitizeFileName } from '../helpers';

import Command from "./base"

const debug = d("command:init");
const createDir = promisify(fs.mkdir);
const createFile = promisify(fs.writeFile);

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
    force: flags.boolean(
      {
        char: "f",
        description: "Overwrite config files if they exist",
        default: false
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
    debug(`before queryBuilder.responses()`)
    const queryResponses: any = await queryBuilder.responses()

    // const name = args.name || (await getFilenameFromInput("What is the project working name?", "MyNovel"));
    // const remoteRepo = flags.gitRemote || (await getFilenameFromInput("What is the project working name?", "MyNovel"));
    debug(`queryResponses = ${queryResponses}`)
    const name = args.name || queryResponses.name
    const remoteRepo = flags.gitRemote || queryResponses.gitRemote || '';

    // Create folder structure, with /config /chapters /characters /places /props /timeline
    debug("Before createDir");
    try {
      cli.action.start('Creating config directory')
      await createDir(this.configInstance.configPath);
    } catch (err) {
      debug(err);
      this.warn(`${this.configInstance.configPath} already exists, or filesystem access denied.`);
    } finally {
      cli.action.stop()
    }

    debug("After createDir, before createFile (config.json5)");
    // Create /config files: config.json5, empty.md, fields.json5
    if (!flags.force && fs.existsSync(this.configInstance.configFilePath)) {
      this.warn(`${this.configInstance.configFilePath} already exists.  Use option --force to overwrite.`);
    } else {
      try {
        cli.action.start('Creating config file')
        await createFile(
          this.configInstance.configFilePath,
          // json.stringify(configInstance.configDefaultsWithMeta, null, 4),
          this.configInstance.configDefaultsWithMetaString
        );
        cli.log(`Created ${this.configInstance.configFilePath} with basic config.`);
      } catch (err) {
        this.error(err);
        this.exit(1);
      } finally {
        cli.action.stop()
      }
    }

    debug("After creating config.json5, before createFile (empty.md)");

    if (!flags.force && fs.existsSync(this.configInstance.emptyFilePath)) {
      this.warn(`${this.configInstance.emptyFilePath} already exists.  Use option --force to overwrite.`);
    } else {
      try {
        cli.action.start('Creating empty chapter file')
        await createFile(this.configInstance.emptyFilePath, this.configInstance.emptyFileString)
        cli.log(`Created ${this.configInstance.emptyFilePath} with basic empty file template.`);
      } catch (err) {
        this.error(err);
        this.exit(1);
      } finally {
        cli.action.stop()
      }
    }

    debug("After creating empty.md, before creating readme.md")

    if (!flags.force && fs.existsSync(this.configInstance.readmeFilePath)) {
      this.warn(`${this.configInstance.readmeFilePath} already exists.  Use option --force to overwrite.`);
    } else {
      try {
        cli.action.start('Creating readme file')
        await createFile(this.configInstance.readmeFilePath, `# ${name}\n\nA novel.`)
        cli.log(`Created ${this.configInstance.readmeFilePath} with basic readme file template.`);
      } catch (err) {
        this.error(err);
        this.exit(1);
      } finally {
        cli.action.stop()
      }
    }

    debug("After creating readme.md, before creating .gitignore")

    if (!flags.force && fs.existsSync(this.configInstance.gitignoreFilePath)) {
      this.warn(`${this.configInstance.gitignoreFilePath} already exists.  Use option --force to overwrite.`);
    } else {
      try {
        cli.action.start('Creating gitignore file')
        await createFile(this.configInstance.gitignoreFilePath, `build/
pandoc*/
`)
        cli.log(`Created ${this.configInstance.gitignoreFilePath} with basic .gitignore file template.`);
      } catch (err) {
        this.error(err);
        this.exit(1);
      } finally {
        cli.action.stop()
      }
    }

    debug("After creating .gitignore, before creating .gitattributes")

    if (!flags.force && fs.existsSync(this.configInstance.gitattributesFilePath)) {
      this.warn(`${this.configInstance.gitattributesFilePath} already exists.  Use option --force to overwrite.`);
    } else {
      try {
        cli.action.start('Creating gitattributes file')
        await createFile(this.configInstance.gitattributesFilePath, `autocrlf=false
eol=lf
* text=auto
`)
        cli.log(`Created ${this.configInstance.gitattributesFilePath} with basic .gitattributes file template.`);
      } catch (err) {
        this.error(err);
        this.exit(1);
      } finally {
        cli.action.stop()
      }
    }

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

      if (remoteRepo) {
        const hasRemote: boolean = await git.getRemotes(false).then(result => {
          return result.find(value => value.name === 'origin') !== undefined
        })
        if (!hasRemote) {
          debug(`adding remote to ${remoteRepo}`)
          await git.addRemote('origin', remoteRepo)
        }

        await git.pull('origin', 'master', { '--commit': null, '--allow-unrelated-histories': null })
        await git.push('origin', 'master', { '-u': null })
        await git.pull('origin', 'master')
      }

    } catch (err) {
      this.error(err)
    } finally {
      cli.action.stop()
    }

    cli.info("End of initialization");
  }

}

