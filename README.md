spixNovel
=========

Command Line tool to handle separate Markdown files with Handlebar notations as a single project

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/spixNovel.svg)](https://npmjs.org/package/spixNovel)
[![Downloads/week](https://img.shields.io/npm/dw/spixNovel.svg)](https://npmjs.org/package/spixNovel)
[![License](https://img.shields.io/npm/l/spixNovel.svg)](https://github.com/spikying/spixNovel/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g spixnovel
$ spixNovel COMMAND
running command...
$ spixNovel (-v|--version|version)
spixnovel/0.0.0 win32-x64 node-v10.15.1
$ spixNovel --help [COMMAND]
USAGE
  $ spixNovel COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`spixNovel add [NAME]`](#spixnovel-add-name)
* [`spixNovel base`](#spixnovel-base)
* [`spixNovel build [TOCFILE] [OUTPUTFILE]`](#spixnovel-build-tocfile-outputfile)
* [`spixNovel delete [NAME]`](#spixnovel-delete-name)
* [`spixNovel help [COMMAND]`](#spixnovel-help-command)
* [`spixNovel init [NAME]`](#spixnovel-init-name)
* [`spixNovel reorder ORIGIN DESTINATION`](#spixnovel-reorder-origin-destination)
* [`spixNovel save [NAME]`](#spixnovel-save-name)

## `spixNovel add [NAME]`

Adds a file or set of files as a new chapter, locally and in repository

```
USAGE
  $ spixNovel add [NAME]

ARGUMENTS
  NAME  name of chapter file(s) to add

OPTIONS
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\add.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\add.ts)_

## `spixNovel base`

```
USAGE
  $ spixNovel base

OPTIONS
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\base.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\base.ts)_

## `spixNovel build [TOCFILE] [OUTPUTFILE]`

Takes all original .MD files and outputs a single .MD file without metadata and comments.  Adds missing files to index file.

```
USAGE
  $ spixNovel build [TOCFILE] [OUTPUTFILE]

ARGUMENTS
  TOCFILE     [default: ./index.json] input file containing all referenced files
  OUTPUTFILE  [default: ./novel.md] output file concatenating all other files's contents

OPTIONS
  -h, --help                  show CLI help
  -n, --[no-]notify           show a notification box when build is completed.  Use --no-notify to suppress notification
  -o, --overwrite=y|n|prompt  [default: prompt] allows overwriting output file if it exists
  -p, --path=path             [default: .] Path where root of project files are
```

_See code: [src\commands\build.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\build.ts)_

## `spixNovel delete [NAME]`

Delete a file locally and in the repository

```
USAGE
  $ spixNovel delete [NAME]

ARGUMENTS
  NAME  filename pattern or chapter number to delete

OPTIONS
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\delete.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\delete.ts)_

## `spixNovel help [COMMAND]`

display help for spixNovel

```
USAGE
  $ spixNovel help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.1.6/src\commands\help.ts)_

## `spixNovel init [NAME]`

Generates basic config files for a new novel project

```
USAGE
  $ spixNovel init [NAME]

ARGUMENTS
  NAME  Name of project

OPTIONS
  -d, --digits=digits        [default: 2] Number of digits to use in file numbering initially.  Defaults to `2`.
  -d, --force                Overwrite config files if they exist
  -h, --help                 show CLI help
  -p, --path=path            [default: .] Path where root of project files are
  -r, --gitRemote=gitRemote  Git address of remote repository.
```

_See code: [src\commands\init.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\init.ts)_

## `spixNovel reorder ORIGIN DESTINATION`

Takes a chapter and modifies its index number to fit another ordering place

```
USAGE
  $ spixNovel reorder ORIGIN DESTINATION

ARGUMENTS
  ORIGIN       chapter number to move
  DESTINATION  number it will become

OPTIONS
  -d, --deep       Makes a recursive subfolder search
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\reorder.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\reorder.ts)_

## `spixNovel save [NAME]`

Parse modified text files, adjust sentence and paragraph endings, commit files to repository and readjust endings.

```
USAGE
  $ spixNovel save [NAME]

ARGUMENTS
  NAME  [default: **/*.*] file pattern of files to save.

OPTIONS
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\save.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\save.ts)_
<!-- commandsstop -->
