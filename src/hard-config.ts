import * as d from 'debug'
import * as path from 'path'

import { loadFileSync } from './soft-config'

const debug = d('config:hard')

export class HardConfig {
  public get configPath(): string {
    return this.configPathName
  }
  public get configFilePath(): string {
    return this.configFileName
  }
  public get metadataFieldsFilePath(): string {
    return path.join(this.configPathName, 'metadataFields.json5')
  }
  public get emptyFilePath(): string {
    return path.join(this.configPathName, 'empty.md')
  }
  public get readmeFilePath(): string {
    return path.join(this.rootPath, 'readme.md')
  }
  public get gitignoreFilePath(): string {
    return path.join(this.rootPath, '.gitignore')
  }
  public get gitattributesFilePath(): string {
    return path.join(this.rootPath, '.gitattributes')
  }
  public get metadataFieldsDefaults(): string {
    const obj = {
      datetimeRange: '',
      revisionSteps: {
        draft: false,
        language: false,
        style: {
          wordRepetitions: false,
          languageLevel: false
        },
        dialogs: false,
        questAnalysis: false,
        tenPercentCut: false
      },
      characters: [],
      mainCharacter: '',
      mainCharacterQuest: '',
      otherQuest: ''
    }

    return JSON.stringify(obj, null, 4)
  }
  public emptyFileString = `
# {TITLE}

`

  private readonly rootPath: string
  private readonly configPathName: string
  private readonly configFileName: string
  constructor(dirname: string) {
    this.rootPath = path.join(dirname)
    this.configPathName = path.join(this.rootPath, './config/')
    this.configFileName = path.join(this.configPathName, 'config.json5')
    try {
      const emptyFileString = loadFileSync(this.emptyFilePath)
      this.emptyFileString = emptyFileString
    } catch (err) {
      debug(err)
    }
  }
}
