import * as d from 'debug'
import * as path from 'path'

const debug = d('config:hard')

export class HardConfig {
  public get configPath(): string {
    if (!this._configPathName) {
      this._configPathName = path.join(this.rootPath, './config/')
    }
    return this._configPathName
  }
  public get configFilePath(): string {
    if (!this._configFileName) {
      this._configFileName = path.join(this.configPath, 'config.json5')
    }
    return this._configFileName
  }
  public get metadataFieldsFilePath(): string {
    return path.join(this.configPath, 'metadataFields.json5')
  }
  public get emptyFilePath(): string {
    return path.join(this.configPath, 'empty.md')
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
  public templateEmptyFileString = `
# {TITLE}

`

  private readonly rootPath: string
  private _configPathName = ''
  private _configFileName = ''
  constructor(dirname: string) {
    debug('In HardConfig constructor')
    this.rootPath = path.join(dirname)
    // this.configPathName = path.join(this.rootPath, './config/')
    // this.configFileName = path.join(this.configPathName, 'config.json5')

    // try {
    //   const emptyFileString = loadFileSync(this.emptyFilePath)
    //   this.emptyFileString = emptyFileString
    // } catch (err) {
    //   debug(err)
    // }
  }

  public antidotePathName(chapterFilename: string): string {
    return path.join(this.rootPath, chapterFilename.replace(/\.\w+$/, '.antidote'))
  }
}
