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
* [`spixNovel antidote [FILE]`](#spixnovel-antidote-file)
* [`spixNovel base`](#spixnovel-base)
* [`spixNovel build [OUTPUTFILE]`](#spixnovel-build-outputfile)
* [`spixNovel delete [NAME]`](#spixnovel-delete-name)
* [`spixNovel edit [FILTER]`](#spixnovel-edit-filter)
* [`spixNovel edit-save-base`](#spixnovel-edit-save-base)
* [`spixNovel help [COMMAND]`](#spixnovel-help-command)
* [`spixNovel init [NAME]`](#spixnovel-init-name)
* [`spixNovel reorder ORIGIN DESTINATION`](#spixnovel-reorder-origin-destination)
* [`spixNovel save [MESSAGE]`](#spixnovel-save-message)

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

## `spixNovel antidote [FILE]`

describe the command here

```
USAGE
  $ spixNovel antidote [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print
```

_See code: [src\commands\antidote.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\antidote.ts)_

## `spixNovel base`

```
USAGE
  $ spixNovel base

OPTIONS
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\base.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\base.ts)_

## `spixNovel build [OUTPUTFILE]`

Takes all original .MD files and outputs a single file without metadata and comments.  Handles these output formats: md, pdf, docx, html, epub, tex

```
USAGE
  $ spixNovel build [OUTPUTFILE]

ARGUMENTS
  OUTPUTFILE  [default: novel] output file concatenating all other files's contents

OPTIONS
  -c, --clean                               removes sentence, paragraph and other markup
  -d, --datetimestamp                       adds datetime stamp before output filename
  -h, --help                                show CLI help

  -n, --[no-]notify                         show a notification box when build is completed.  Use --no-notify to
                                            suppress notification

  -p, --path=path                           [default: .] Path where root of project files are

  -t, --filetype=md|pdf|docx|html|epub|tex  filetype to export in.  Can be set multiple times.
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
  -h, --help                               show CLI help
  -p, --path=path                          [default: .] Path where root of project files are

  -t, --type=all|summary|chapter|metadata  [default: all] Delete either chapter file, summary file, metadata file or
                                           all.
```

_See code: [src\commands\delete.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\delete.ts)_

## `spixNovel edit [FILTER]`

Adjust sentence and paragraph endings to allow for easier editing.

```
USAGE
  $ spixNovel edit [FILTER]

ARGUMENTS
  FILTER  Chapter number(s) to modify, comma-separated.

OPTIONS
  -h, --help                      show CLI help
  -p, --path=path                 [default: .] Path where root of project files are
  -t, --type=all|summary|chapter  [default: all] Edit either chapter file, summary file or all.

ALIASES
  $ spixNovel modify
  $ spixNovel mod
```

_See code: [src\commands\edit.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\edit.ts)_

## `spixNovel edit-save-base`

```
USAGE
  $ spixNovel edit-save-base

OPTIONS
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\edit-save-base.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\edit-save-base.ts)_

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
  -a, --author=author        Author of project
  -d, --digits=digits        [default: 2] Number of digits to use in file numbering initially.  Defaults to `2`.

  -f, --force=force          [default: false] Overwrite config files if they exist.  Specify a filename to overwrite
                             only one; write `true` to overwrite all.

  -h, --help                 show CLI help

  -l, --language=language    Language of project

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
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\reorder.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\reorder.ts)_

## `spixNovel save [MESSAGE]`

Parse modified text files, adjust sentence and paragraph endings, commit files to repository and readjust endings.

```
USAGE
  $ spixNovel save [MESSAGE]

ARGUMENTS
  MESSAGE  Message to use in commit to repository

OPTIONS
  -f, --filter=filter  Chapter number to filter which files to stage before saving to repository
  -h, --help           show CLI help
  -p, --path=path      [default: .] Path where root of project files are
```

_See code: [src\commands\save.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\save.ts)_
<!-- commandsstop -->
