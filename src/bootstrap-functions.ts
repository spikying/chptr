import * as simplegit from 'simple-git/promise'

import { d } from './commands/base'
import { FsUtils } from './fs-utils'
import { HardConfig } from './hard-config'
import { Singleton, Container } from 'typescript-ioc'

const debug = d('BootstrapChptr')

@Singleton
export class BootstrapChptr {
  private readonly rootPath: string
  private readonly hardConfig: HardConfig
  private readonly fsUtils: FsUtils

  constructor(rootPath: string) {
    this.rootPath = rootPath
    this.hardConfig = Container.get(HardConfig)//new HardConfig(rootPath)
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

  public deepCopy(obj: any): any {
    return Object.keys(obj).reduce((retval: any, key: string) => {
      if (obj[key]) {
        if (typeof obj[key] !== 'string' && typeof obj[key] !== 'number' && typeof obj[key] !== 'boolean') {
          if (obj[key] instanceof Array && obj[key].length === 0) {
            return retval
          }
          if (Object.keys(obj[key]).length === 0) {
            return retval
          }

          const deepObj = this.deepCopy(obj[key])
          if (Object.keys(deepObj).length !== 0) {
            retval[key] = deepObj
          }
        } else {
          retval[key] = obj[key]
        }
      }
      return retval
    }, {})
    //  https://stackoverflow.com/questions/28150967/typescript-cloning-object/42758108

    /*
    let copy: any

    // Handle the 3 simple types, and null or undefined
    if (obj === null || typeof obj !== 'object') return obj

    // Handle Date
    if (obj instanceof Date) {
      copy = new Date()
      copy.setTime(obj.getTime())
      return copy
    }

    // Handle Array
    if (obj instanceof Array) {
      if (obj.length) {
        copy = []
        for (let i = 0, len = obj.length; i < len; i++) {
          const tempI = this.deepCopy(obj[i])
          if (tempI) {
            copy[i] = tempI
          }
        }
      }
      if (copy) {
        return copy
      } else {
        return null
      }
    }

    // Handle Object
    if (obj instanceof Object) {
      copy = {}
      for (let attr in obj) {
        if (obj.hasOwnProperty(attr) && obj[attr]) {
          const tempAttr = this.deepCopy(obj[attr])
          if (tempAttr) {
            copy[attr] = tempAttr
          }
        }
      }
      if (copy) {
        return copy
      }
      return null
    }

    throw new Error("Unable to copy obj! Its type isn't supported.")
    */
  }
}
