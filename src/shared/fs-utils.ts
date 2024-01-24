import { ux } from '@oclif/core'

import { glob } from 'glob'
import * as latinize from 'latinize'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { promisify } from 'node:util'

import sanitize = require('sanitize-filename')
import { Singleton } from 'typescript-ioc'
import { ChptrError } from './chptr-error'

const debug = require('debug')('fs-utils')

@Singleton
export class FsUtils {
  public readonly accessSync = function (filePath: string): void {
    return fs.accessSync(filePath, fs.constants.R_OK)
  }

  public readonly copyFile = promisify(fs.copyFile)
  public readonly deleteDir = promisify(fs.rmdir)
  public readonly deleteFile = promisify(fs.unlink)
  public readonly fileExists = async function (path: fs.PathLike): Promise<boolean> {
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

  public readonly fileExistsSync = function (path: fs.PathLike): boolean {
    try {
      fs.accessSync(path)
      return true
    } catch {
      return false
    }
  }

  public readonly fileStat = async function (path: fs.PathLike): Promise<{ path: fs.PathLike; stats: fs.Stats }> {
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

  public readonly loadFileSync = function (path: string): string {
    return fs.readFileSync(path, 'utf8')
  }

  public readonly mkdtemp = promisify(fs.mkdtemp)

  public readonly moveFile = promisify(fs.rename)
  public readonly writeFile = async function (path: string, data: string) {
    const wf = promisify(fs.writeFile)
    const triedWF = (path: string, data: string) => {
      try {
        return wf(path, data, 'utf8')
      } catch (error: any) {
        throw new ChptrError(error, 'fs-utils.writefile', 100)
      }
    }

    return triedWF(path, data)
  }

  public readonly writeFileSync = function (path: string, data: string) {
    const wf = fs.writeFileSync
    const triedWF = (path: string, data: string) => {
      try {
        return wf(path, data, 'utf8')
      } catch (error: any) {
        throw new ChptrError(error, 'fs-utils.writefile', 100)
      }
    }

    return triedWF(path, data)
  }

  public readonly writeInFile = promisify(fs.write)

  private readonly readFileBuffer = promisify(fs.readFile)

  public async createFile(fullPathName: string, content: string) {
    await this.createSubDirectoryFromFilePathIfNecessary(fullPathName)

    const createFile = promisify(fs.writeFile)
    try {
      await createFile(fullPathName, content, { encoding: 'utf8' })
    } catch (error: any) {
      throw new ChptrError(error, 'fs-utils.createfile', 101)
    }

    debug(`Created ${fullPathName.resultHighlighColor()}`.resultNormalColor())
  }

  public async createSubDirectoryFromDirectoryPathIfNecessary(directoryPath: string): Promise<null | string> {
    const mkdirp = require('mkdirp')

    return mkdirp(directoryPath)
    // return new Promise((resolve, reject) => {
    //   mkdirp(directoryPath, (err: any, made: any) => {
    //     if (err) {
    //       debug(err)
    //       reject(err)
    //     }
    //     resolve(made)
    //   })
    // })
  }

  public async createSubDirectoryFromFilePathIfNecessary(fullFilePath: string): Promise<null | string> {
    const directoryPath = path.dirname(fullFilePath)
    return this.createSubDirectoryFromDirectoryPathIfNecessary(directoryPath)
  }

  public async deleteEmptySubDirectories(rootPath: string): Promise<string[]> {
    const allDirs = await glob('**/', { cwd: rootPath })
    const emptyDirs: string[] = []
    for (const subDir of allDirs) {
      const filesOfSubDir = await glob('**', { cwd: path.join(rootPath, subDir) })
      if (filesOfSubDir.length === 0) {
        emptyDirs.push(subDir)
      }
    }

    for (const subDir of emptyDirs) {
      await this.deleteDir(path.join(rootPath, subDir))
    }

    return emptyDirs
  }

  public async getAllFilesForWildcards(wildcards: string[], rootPath: string): Promise<string[]> {
    const files: string[] = []
    for (const wildcard of wildcards) {
      files.push(...(await glob(path.join(rootPath, wildcard))))
    }

    return files
  }

  public async getTempDir(rootPath: string): Promise<{ removeTempDir(): Promise<void>; tempDir: string }> {
    let tempDir = ''
    try {
      const tempPrefix = 'temp'
      tempDir = await this.mkdtemp(path.join(rootPath, tempPrefix))
      debug(`Created temp dir: ${tempDir}`)
    } catch (error: any) {
      throw new ChptrError(error, 'fs-utils.gettempdir', 102)
    }

    const delDirFct = this.deleteDir
    const removeTempDir = async function () {
      try {
        debug(`Deleting temp dir: ${tempDir}`)
        await delDirFct(tempDir)
      } catch (error: any) {
        throw new ChptrError(error, 'fs-utils.removetempdir', 103)
      }
    }

    return { removeTempDir, tempDir }
  }

  public async readFileContent(filepath: string): Promise<string> {
    try {
      const buff = await this.readFileBuffer(filepath)
      const content = (await buff.toString('utf8', 0, buff.byteLength))
        .replace(/^\uFEFF/, '\n') // un-BOM the file
        .replaceAll('\r\n', '\n')
      return content
    } catch (error: any) {
      debug(error.toString().errorColor())
      ux.warn(`Could not read file content of ${filepath}`.errorColor())
      return ''
    }
  }

  public sanitizeFileName(original: string, keepFolders = false, removeSpace = false): string {
    if (keepFolders) {
      original = original.replaceAll(/[/\\]/g, '\u2029')
    }

    let sanitized = sanitize(original).replaceAll('\u2029', path.sep).replace('@', 'a').replaceAll('`', '')
    if (removeSpace) {
      sanitized = sanitized.replace(' ', '_')
    }

    sanitized = latinize(sanitized)
    return sanitized
  }

  public sanitizeMermaid(original: string): string {
    const sanitized = original.replaceAll('@', 'a').replaceAll(/\(|\)/g, '_').replaceAll('`', '')

    return sanitized
    // return latinize(sanitized)
  }

  public sanitizeUrl(original: string): string {
    const sanitize_url = require('@braintree/sanitize-url').sanitizeUrl
    const sanitized = sanitize_url(original)
    if (sanitized === 'about:blank') {
      return ''
    }

    return sanitized
  }
}
