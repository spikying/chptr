import * as path from 'node:path'
import { InjectValue, Singleton } from 'typescript-ioc'
import * as YAML from 'yaml'

const debug = require('debug')('config:hard')

@Singleton
export class HardConfig {
  public templateEmptyFileString = `\n# {TITLE}\n\n`
  public templateGitattributesString = `autocrlf=false\neol=lf\n* text=auto\n`
  public templateGitignoreString = `build/\npandoc*/\n*.antidote\n`

  private _configFileName = ''
  private _configPathName = ''

  // public get WordCountDataFilenameWithoutExtension(): string {
  //   return 'wordCountData'
  // }

  private readonly _metadataFieldsDefaultsObj = {
    characters: [],
    datetimeRange: '',
    mainCharacter: '',
    mainCharacterQuest: '',
    otherQuest: '',
    revisionSteps: {
      dialogs: false,
      draft: false,
      language: false,
      questAnalysis: false,
      style: {
        languageLevel: false,
        wordRepetitions: false
      },
      tenPercentCut: false
    }
  }

  private readonly rootPath: string
  constructor(@InjectValue('rootPath') rootPath: string) {
    debug('CONSTRUCTOR HARD-CONFIG')
    debug(`will use path ${rootPath}`)
    this.rootPath = path.join(rootPath)
  }

  public get configJSON5FilePath(): string {
    if (!this._configFileName) {
      this._configFileName = path.join(this.configPath, 'config.json5')
    }

    return this._configFileName
  }

  public get configPath(): string {
    if (!this._configPathName) {
      this._configPathName = path.join(this.rootPath, './config/')
    }

    return this._configPathName
  }

  public get configYAMLFilePath(): string {
    return path.join(this.configPath, 'config.yaml')
  }

  public get emptyFilePath(): string {
    return path.join(this.configPath, 'empty.md')
  }

  public get gitattributesFilePath(): string {
    return path.join(this.rootPath, '.gitattributes')
  }

  public get gitignoreFilePath(): string {
    return path.join(this.rootPath, '.gitignore')
  }

  public get metadataFieldsDefaultsJSONString(): string {
    return JSON.stringify(this._metadataFieldsDefaultsObj, null, 4)
  }

  public get metadataFieldsDefaultsYAMLString(): string {
    return YAML.stringify(this._metadataFieldsDefaultsObj)
  }

  public get metadataFieldsJSON5FilePath(): string {
    return path.join(this.configPath, 'metadataFields.json5')
  }

  public get metadataFieldsYAMLFilePath(): string {
    return path.join(this.configPath, 'metadataFields.yaml')
  }

  public get readmeFilePath(): string {
    return path.join(this.rootPath, 'readme.md')
  }

  public antidotePathName(chapterFilename: string): string {
    return path.join(this.rootPath, chapterFilename.replace(/\.\w+$/, '.antidote'))
  }

  public isEndOfStack(value: string): boolean {
    const re = new RegExp(/^@?end$/)
    return re.test(value)
  }
}
