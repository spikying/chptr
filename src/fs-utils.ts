import { cli } from 'cli-ux'
import * as d from 'debug'
import * as fs from 'fs'
import * as glob from 'glob'
import * as path from 'path'
import { promisify } from 'util'

const debug = d('fs-utils')

export class FsUtils {
  public readonly writeInFile = promisify(fs.write)
  public readonly copyFile = promisify(fs.copyFile)
  public readonly moveFile = promisify(fs.rename)
  public readonly listFiles = promisify(glob)
  public readonly createDir = promisify(fs.mkdir)
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
    return wf(path, data, 'utf8')
  }

  public async createSubDirectoryIfNecessary(fullFilePath: string): Promise<string | null> {
    const mkdirp = require('mkdirp')

    return new Promise((resolve, reject) => {
      const directoryPath = path.dirname(fullFilePath)
      mkdirp(directoryPath, (err: any, made: any) => {
        if (err) {
          debug(err)
          reject(err)
        }
        resolve(made)
      })
    })
  }

  public async createFile(fullPathName: string, content: string) {
    await this.createSubDirectoryIfNecessary(fullPathName)

    const createFile = promisify(fs.writeFile)
    try {
      await createFile(fullPathName, content, { encoding: 'utf8' })
    } catch (err) {
      cli.error(err.toString().errorColor())
      cli.exit(1)
    } finally {
      cli.info(`Created ${fullPathName.resultHighlighColor()}`.resultNormalColor())
    }
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
      cli.error(err.toString().errorColor())
      cli.exit(1)
    }

    const delDirFct = this.deleteDir
    const removeTempDir = async function() {
      try {
        debug(`Deleting temp dir: ${tempDir}`)
        await delDirFct(tempDir)
      } catch (err) {
        cli.error(err.toString().errorColor())
        cli.exit(1)
      }
    }

    return { tempDir, removeTempDir }
  }

  
  public async readFileContent(filepath: string): Promise<string> {
    try {
      const buff = await this.readFileBuffer(filepath)
      const content = await buff.toString('utf8', 0, buff.byteLength)
      return content
    } catch {
      return ''
    }
  }

}
