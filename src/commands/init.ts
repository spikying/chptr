import { flags } from "@oclif/command";
import { cli } from "cli-ux";
import * as d from "debug";
import * as fs from "fs";
// import { Config } from "../config";
// import { StatusSummary } from 'simple-git';
import * as simplegit from 'simple-git/promise';
import { promisify } from "util";

import { getFilenameFromInput, QueryBuilder } from "../common";

import Command from "./base"
import { sanitizeFileName } from '../helpers';

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
        char: "d",
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
    const queryResponses: any = await queryBuilder.responses()

    // const name = args.name || (await getFilenameFromInput("What is the project working name?", "MyNovel"));
    // const remoteRepo = flags.gitRemote || (await getFilenameFromInput("What is the project working name?", "MyNovel"));
    const name = args.name || queryResponses.name
    const remoteRepo = flags.gitRemote || queryResponses.gitRemote || '';

    // Create folder structure, with /config /chapters /characters /places /props /timeline
    debug("Before createDir");
    try {
      await createDir(this.configInstance.configPath);
    } catch (err) {
      debug(err);
      this.warn(`${this.configInstance.configPath} already exists, or filesystem access denied.`);
    }

    debug("After createDir, before createFile (config.json5)");

    // Create /config files: config.json5, empty.md, fields.json5
    if (!flags.force && fs.existsSync(this.configInstance.configFilePath)) {
      this.warn(`${this.configInstance.configFilePath} already exists.  Use option --force to overwrite.`);
    } else {
      try {
        await createFile(
          this.configInstance.configFilePath,
          // json.stringify(configInstance.configDefaultsWithMeta, null, 4),
          this.configInstance.configDefaultsWithMetaString
        );
        this.log(`Created ${this.configInstance.configFilePath} with basic config.`);
      } catch (err) {
        this.error(err);
        this.exit(1);
      }
    }

    debug("After creating config.json5, before createFile (empty.md)");

    if (!flags.force && fs.existsSync(this.configInstance.emptyFilePath)) {
      this.warn(`${this.configInstance.emptyFilePath} already exists.  Use option --force to overwrite.`);
    } else {
      try {
        await createFile(this.configInstance.emptyFilePath, this.configInstance.emptyFileString)
        this.log(`Created ${this.configInstance.emptyFilePath} with basic empty file template.`);
      } catch (err) {
        this.error(err);
        this.exit(1);
      }
    }

    // Create git repo
    try {

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

        await git.push('origin', 'master', { '-u': null })
      }

      await git.fetch()

    } catch (err) {
      this.error(err)
    }



    debug("End of config creation");
  }

}

