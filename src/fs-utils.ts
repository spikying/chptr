import { cli } from 'cli-ux'
import * as d from 'debug'
import * as fs from 'fs'
import * as glob from 'glob'
import * as latinize from 'latinize'
import * as path from 'path'
import * as sanitize from 'sanitize-filename'
import { promisify } from 'util'

import { ChptrError } from './chptr-error'

const debug = d('fs-utils')

export class FsUtils {
  public readonly writeInFile = promisify(fs.write)
  public readonly copyFile = promisify(fs.copyFile)
  public readonly moveFile = promisify(fs.rename)
  public readonly listFiles = promisify(glob)
  // public readonly createDir = promisify(fs.mkdir)
  public readonly deleteDir = promisify(fs.rmdir)
  public readonly deleteFile = promisify(fs.unlink)
  public readonly mkdtemp = promisify(fs.mkdtemp)
  public readonly globPromise = promisify(glob)
  public readonly loadFileSync = fs.readFileSync as (path: string) => string

  private readonly readFileBuffer = promisify(fs.readFile)
  public readonly accessSync = function(filePath: string): void {
    return fs.accessSync(filePath, fs.constants.R_OK)
  }

  public readonly fileStat = async function(path: fs.PathLike): Promise<{ path: fs.PathLike; stats: fs.Stats }> {
    return new Promise((resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) {
          reject(err)
        } else {
          resolve({ path, stats })
        }
      })
    })
  }

  public readonly fileExists = async function(path: fs.PathLike): Promise<boolean> {
    return new Promise(resolve => {
      fs.access(path, err => {
        if (err) {
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }
  public readonly writeFile = async function(path: string, data: string) {
    const wf = promisify(fs.writeFile)
    const triedWF = (path: string, data: string) => {
      try {
        return wf(path, data, 'utf8')
      } catch (err) {
        throw new ChptrError(err, 'fs-utils.writefile', 100)
      }
    }
    return triedWF(path, data)
    // return wf(path, data, 'utf8')
  }

  public async createSubDirectoryFromDirectoryPathIfNecessary(directoryPath: string): Promise<string | null> {
    const mkdirp = require('mkdirp')

    return new Promise((resolve, reject) => {
      mkdirp(directoryPath, (err: any, made: any) => {
        if (err) {
          debug(err)
          reject(err)
        }
        resolve(made)
      })
    })
  }
  public async createSubDirectoryFromFilePathIfNecessary(fullFilePath: string): Promise<string | null> {
    const directoryPath = path.dirname(fullFilePath)
    return this.createSubDirectoryFromDirectoryPathIfNecessary(directoryPath)
    // const mkdirp = require('mkdirp')

    // return new Promise((resolve, reject) => {
    //   const directoryPath = path.dirname(fullFilePath)
    //   mkdirp(directoryPath, (err: any, made: any) => {
    //     if (err) {
    //       debug(err)
    //       reject(err)
    //     }
    //     resolve(made)
    //   })
    // })
  }

  public async createFile(fullPathName: string, content: string) {
    await this.createSubDirectoryFromFilePathIfNecessary(fullPathName)

    const createFile = promisify(fs.writeFile)
    try {
      await createFile(fullPathName, content, { encoding: 'utf8' })
    } catch (err) {
      throw new ChptrError(err, 'fs-utils.createfile', 101)
    }
    cli.info(`Created ${fullPathName.resultHighlighColor()}`.resultNormalColor())
  }

  public async getAllFilesForWildcards(wildcards: string[], rootPath: string): Promise<string[]> {
    const files: string[] = []
    for (const wildcard of wildcards) {
      files.push(...(await this.globPromise(path.join(rootPath, wildcard))))
    }
    return files
  }

  public async deleteEmptySubDirectories(rootPath: string): Promise<string[]> {
    const allDirs = await this.globPromise('**/', { cwd: rootPath })
    const emptyDirs: string[] = []
    for (const subDir of allDirs) {
      const filesOfSubDir = await this.globPromise('**', { cwd: path.join(rootPath, subDir) })
      if (filesOfSubDir.length === 0) {
        emptyDirs.push(subDir)
      }
    }

    for (const subDir of emptyDirs) {
      await this.deleteDir(path.join(rootPath, subDir))
    }

    return emptyDirs
  }

  public async getTempDir(rootPath: string): Promise<{ tempDir: string; removeTempDir(): Promise<void> }> {
    let tempDir = ''
    try {
      const tempPrefix = 'temp'
      tempDir = await this.mkdtemp(path.join(rootPath, tempPrefix))
      debug(`Created temp dir: ${tempDir}`)
    } catch (err) {
      throw new ChptrError(err, 'fs-utils.gettempdir', 102)
    }

    const delDirFct = this.deleteDir
    const removeTempDir = async function() {
      try {
        debug(`Deleting temp dir: ${tempDir}`)
        await delDirFct(tempDir)
      } catch (err) {
        throw new ChptrError(err, 'fs-utils.removetempdir', 103)
      }
    }

    return { tempDir, removeTempDir }
  }

  public async readFileContent(filepath: string): Promise<string> {
    try {
      const buff = await this.readFileBuffer(filepath)
      const content = (await buff.toString('utf8', 0, buff.byteLength))
        .replace(/^\uFEFF/, '\n') // un-BOM the file
        .replace(/\r\n/g, '\n')
      return content
    } catch (err) {
      debug(err.toString().errorColor())
      cli.warn(`Could not read file content of ${filepath}`.errorColor())
      return ''
    }
  }

  public sanitizeFileName(original: string, keepFolders = false): string {
    if (keepFolders) {
      original = original.replace(/[\/\\]/g, '\u2029')
    }
    const sanitized = sanitize(original).replace(/\u2029/g, path.sep)
    const latinized = latinize(sanitized)
    return latinized
  }

  public sanitizeUrl(original: string): string {
    const sanitize_url = require('@braintree/sanitize-url').sanitizeUrl
    const sanitized = sanitize_url(original)
    if (sanitized === 'about:blank') {
      return ''
    }
    return sanitized
  }

  public numDigits(x: number, buffer = 2): number {
    return Math.max(Math.floor(Math.log10(Math.abs(x + buffer))), 0) + 1
  }

  public stringifyNumber(x: number, digits: number): string {
    const s = x.toString()
    const zeroes = Math.max(digits - s.length, 0)
    if (zeroes > 0) {
      return '0'.repeat(zeroes).concat(s)
    } else {
      return s
    }
  }
}
