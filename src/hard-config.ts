import * as d from 'debug'
import * as path from 'path'
import * as YAML from 'yaml'

const debug = d('config:hard')

export class HardConfig {
  public get configPath(): string {
    if (!this._configPathName) {
      this._configPathName = path.join(this.rootPath, './config/')
    }
    return this._configPathName
  }
  public get configJSON5FilePath(): string {
    if (!this._configFileName) {
      this._configFileName = path.join(this.configPath, 'config.json5')
    }
    return this._configFileName
  }
  public get configYAMLFilePath(): string {
    return path.join(this.configPath, 'config.yaml')
  }

  public get metadataFieldsJSON5FilePath(): string {
    return path.join(this.configPath, 'metadataFields.json5')
  }
  public get metadataFieldsYAMLFilePath(): string {
    return path.join(this.configPath, 'metadataFields.yaml')
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
  public get metadataFieldsDefaultsJSONString(): string {
    return JSON.stringify(this._metadataFieldsDefaultsObj, null, 4)
  }
  public get metadataFieldsDefaultsYAMLString(): string{
    return YAML.stringify(this._metadataFieldsDefaultsObj)
  }

  public templateEmptyFileString = `\n# {TITLE}\n\n`
  public templateGitignoreString = `build/\npandoc*/\n*.antidote\n`
  public templateGitattributesString = `autocrlf=false\neol=lf\n* text=auto\n`

  private readonly _metadataFieldsDefaultsObj = {
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

  private readonly rootPath: string
  private _configPathName = ''
  private _configFileName = ''
  
  constructor(dirname: string) {
    debug('In HardConfig constructor')
    this.rootPath = path.join(dirname)
  }

  public antidotePathName(chapterFilename: string): string {
    return path.join(this.rootPath, chapterFilename.replace(/\.\w+$/, '.antidote'))
  }
}
