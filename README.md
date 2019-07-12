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
* [`spixNovel add [NAME] [NUMBER]`](#spixnovel-add-name-number)
* [`spixNovel antidote [FILTER]`](#spixnovel-antidote-filter)
* [`spixNovel build`](#spixnovel-build)
* [`spixNovel delete [NAME]`](#spixnovel-delete-name)
* [`spixNovel edit [FILTER]`](#spixnovel-edit-filter)
* [`spixNovel help [COMMAND]`](#spixnovel-help-command)
* [`spixNovel init [NAME]`](#spixnovel-init-name)
* [`spixNovel rename [CHAPTERORFILENAME] [NEWNAME]`](#spixnovel-rename-chapterorfilename-newname)
* [`spixNovel reorder ORIGIN DESTINATION`](#spixnovel-reorder-origin-destination)
* [`spixNovel save [MESSAGE]`](#spixnovel-save-message)
* [`spixNovel track [FILENAME]`](#spixnovel-track-filename)

## `spixNovel add [NAME] [NUMBER]`

Adds a file or set of files as a new chapter, locally and in repository

```
USAGE
  $ spixNovel add [NAME] [NUMBER]

ARGUMENTS
  NAME    name of chapter file(s) to add

  NUMBER  force this number to be used, if available.  If this argument is given, the `atnumbered` flag is ignored.
          AtNumbering will be determined by the presence or absence of @ sign.

OPTIONS
  -a, --atnumbered  Add an @numbered chapter
  -h, --help        show CLI help
  -n, --notify      show a notification box when build is completed.
  -p, --path=path   [default: .] Path where root of project files are
```

_See code: [src\commands\add.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\add.ts)_

## `spixNovel antidote [FILTER]`

Launch Antidote spell-checker for given chapter

```
USAGE
  $ spixNovel antidote [FILTER]

ARGUMENTS
  FILTER  Chapter number to Antidote.

OPTIONS
  -h, --help       show CLI help
  -n, --notify     show a notification box when build is completed.
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\antidote.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\antidote.ts)_

## `spixNovel build`

Takes all original .MD files and outputs a single file without metadata and comments.  Handles these output formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

```
USAGE
  $ spixNovel build

OPTIONS
  -c, --compact                                Compact chapter numbers at the same time
  -d, --datetimestamp                          adds datetime stamp before output filename
  -h, --help                                   show CLI help
  -n, --notify                                 show a notification box when build is completed.
  -p, --path=path                              [default: .] Path where root of project files are
  -r, --removemarkup                           Remove paragraph numbers and other markup in output
  -s, --showWritingRate=all|short|none|export  [default: short] Show word count per day in varying details
  -t, --filetype=md|pdf|docx|html|epub|tex     filetype to export to.  Can be set multiple times.

ALIASES
  $ spixNovel compile
```

_See code: [src\commands\build.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\build.ts)_

## `spixNovel delete [NAME]`

Delete a chapter or tracked file locally and in the repository

```
USAGE
  $ spixNovel delete [NAME]

ARGUMENTS
  NAME  chapter number or filename to delete

OPTIONS
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -n, --notify     show a notification box when build is completed.
  -p, --path=path  [default: .] Path where root of project files are

ALIASES
  $ spixNovel del
```

_See code: [src\commands\delete.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\delete.ts)_

## `spixNovel edit [FILTER]`

Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

```
USAGE
  $ spixNovel edit [FILTER]

ARGUMENTS
  FILTER  Chapter number(s) to modify, comma-separated.

OPTIONS
  -h, --help                      show CLI help
  -n, --notify                    show a notification box when build is completed.
  -p, --path=path                 [default: .] Path where root of project files are
  -t, --type=all|summary|chapter  [default: all] Edit either chapter file, summary file or all.

ALIASES
  $ spixNovel modify
  $ spixNovel mod
```

_See code: [src\commands\edit.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\edit.ts)_

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
  -a, --author=author        Name of author of project
  -d, --digits=digits        [default: 2] Number of digits to use in file numbering initially.  Defaults to `2`.
  -e, --email=email          Email of author of project

  -f, --force=force          [default: false] Overwrite config files if they exist.  Specify a filename to overwrite
                             only one; write `true` to overwrite all.

  -h, --help                 show CLI help

  -l, --language=language    Language of project

  -n, --notify               show a notification box when build is completed.

  -p, --path=path            [default: .] Path where root of project files are

  -r, --gitRemote=gitRemote  Git address of remote repository.
```

_See code: [src\commands\init.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\init.ts)_

## `spixNovel rename [CHAPTERORFILENAME] [NEWNAME]`

Modify chapter title in text, metadata and filename or tracked filename

```
USAGE
  $ spixNovel rename [CHAPTERORFILENAME] [NEWNAME]

ARGUMENTS
  CHAPTERORFILENAME  Chapter number or tracked filename to modify
  NEWNAME            New chapter name

OPTIONS
  -h, --help       show CLI help
  -n, --notify     show a notification box when build is completed.
  -p, --path=path  [default: .] Path where root of project files are
  -t, --title      'Use chapter's title as new name.  Will supercede a `newName` argument.
```

_See code: [src\commands\rename.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\rename.ts)_

## `spixNovel reorder ORIGIN DESTINATION`

Takes a chapter and modifies its index number to fit another ordering place

```
USAGE
  $ spixNovel reorder ORIGIN DESTINATION

ARGUMENTS
  ORIGIN       Chapter number to move
  DESTINATION  Number it will become (write `end` or `@end`to put at the end of each stack).

OPTIONS
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -n, --notify     show a notification box when build is completed.
  -p, --path=path  [default: .] Path where root of project files are

ALIASES
  $ spixNovel move
```

_See code: [src\commands\reorder.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\reorder.ts)_

## `spixNovel save [MESSAGE]`

Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.

```
USAGE
  $ spixNovel save [MESSAGE]

ARGUMENTS
  MESSAGE  Message to use in commit to repository

OPTIONS
  -f, --filename=filename  Tracked filename or filename pattern to filter which files sto stage before saving to
                           repository

  -h, --help               show CLI help

  -n, --notify             show a notification box when build is completed.

  -n, --number=number      Chapter number to filter which files to stage before saving to repository

  -p, --path=path          [default: .] Path where root of project files are

ALIASES
  $ spixNovel commit
```

_See code: [src\commands\save.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\save.ts)_

## `spixNovel track [FILENAME]`

Add a file to be tracked in repository that is not a chapter, summary or metadata file.

```
USAGE
  $ spixNovel track [FILENAME]

ARGUMENTS
  FILENAME  Filename to track

OPTIONS
  -h, --help       show CLI help
  -n, --notify     show a notification box when build is completed.
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\track.ts](https://github.com/spikying/spixNovel/blob/v0.0.0/src\commands\track.ts)_
<!-- commandsstop -->
