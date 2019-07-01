import { Command, flags } from '@oclif/command'
import * as deb from 'debug';
import * as fs from 'fs';
import * as glob from "glob";
import * as path from "path";
import { promisify } from "util";

import { Config } from "../config";

export const readFile = promisify(fs.readFile)
export const writeFile = promisify(fs.writeFile)
export const createFile = promisify(fs.writeFile);
export const writeInFile = promisify(fs.write);
export const copyFile = promisify(fs.copyFile)
export const moveFile = promisify(fs.rename)
export const listFiles = promisify(glob);
export const createDir = promisify(fs.mkdir);
export const d = deb

const debug = d('command:base')

export default abstract class extends Command {
  static flags = {
    help: flags.help({ char: "h" }),
    path: flags.string(
      {
        char: "p",
        default: ".",
        description: "Path where root of project files are"
      })
  }

  private _configInstance: Config | undefined
  public get configInstance(): Config {
    return this._configInstance as Config
  }

  async init() {
    // do some initialization
    const { flags } = this.parse(this.constructor as any)
    // this.flags = flags
    const dir = path.join(flags.path as string);
    this._configInstance = new Config(dir);
  }

  async catch(err: Error) {
    // handle any error from the command
    this.error(err)
    this.exit(1)
  }
  async finally() { // parameter (err)
    // called after run and catch regardless of whether or not the command errored
  }


}
