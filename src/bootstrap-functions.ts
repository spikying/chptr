import * as simplegit from 'simple-git/promise'

import { FsUtils } from './fs-utils'
import { HardConfig } from './hard-config'

export class BootstrapChptr {
  private rootPath: string
  private hardConfig: HardConfig
  private fsUtils: FsUtils

  constructor(rootPath: string) {
    this.rootPath = rootPath
    this.hardConfig = new HardConfig(rootPath)
    this.fsUtils = new FsUtils()
  }

  public async isChptrFolder(): Promise<boolean> {
    const git = simplegit(this.rootPath)
    const isRepo = await git.checkIsRepo()
    const hasConfigFolder = await this.fsUtils.fileExists(this.hardConfig.configPath)
    const hasConfigJSON5File = await this.fsUtils.fileExists(this.hardConfig.configJSON5FilePath)
    const hasConfigYAMLFile = await this.fsUtils.fileExists(this.hardConfig.configYAMLFilePath)

    if (!isRepo || !hasConfigFolder || !(hasConfigJSON5File || hasConfigYAMLFile)) {
      return false
    } else {
      return true
    }
  }
}
