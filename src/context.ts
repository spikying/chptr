import * as path from "path";

import { Config } from './config';

export class Context {
  private readonly configInstance: Config;

  constructor(configInstance: Config) {
    // this.dirname = dirname
    this.configInstance = configInstance

  }

  public mapFileToBeRelativeToRootPath(file: string): string {
    return path.relative(this.configInstance.projectRootPath, file)
  }
  public mapFilesToBeRelativeToRootPath(files: string[]): string[] {
    return files.map<string>((filename) => {
      return this.mapFileToBeRelativeToRootPath(filename)
    });
  }

}
