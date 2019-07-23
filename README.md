# chptr

Command Line tool to handle separate Markdown files with special markup notations and export as a complete document.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/chptr.svg)](https://npmjs.org/package/chptr)
[![Downloads/week](https://img.shields.io/npm/dw/chptr.svg)](https://npmjs.org/package/chptr)
[![License](https://img.shields.io/npm/l/chptr.svg)](https://github.com/spikying/chptr/blob/master/package.json)

<!-- toc -->
* [chptr](#chptr)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g chptr
$ chptr COMMAND
running command...
$ chptr (-v|--version|version)
chptr/0.1.0 win32-x64 node-v10.15.1
$ chptr --help [COMMAND]
USAGE
  $ chptr COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`chptr add [NAME] [NUMBER]`](#chptr-add-name-number)
* [`chptr antidote [FILTER]`](#chptr-antidote-filter)
* [`chptr build`](#chptr-build)
* [`chptr delete [NAME]`](#chptr-delete-name)
* [`chptr edit [FILTER]`](#chptr-edit-filter)
* [`chptr help [COMMAND]`](#chptr-help-command)
* [`chptr init [NAME]`](#chptr-init-name)
* [`chptr rename [CHAPTERORFILENAME] [NEWNAME]`](#chptr-rename-chapterorfilename-newname)
* [`chptr reorder ORIGIN DESTINATION`](#chptr-reorder-origin-destination)
* [`chptr save [MESSAGE]`](#chptr-save-message)
* [`chptr split ORIGIN`](#chptr-split-origin)
* [`chptr track [FILENAME]`](#chptr-track-filename)

## `chptr add [NAME] [NUMBER]`

Adds a file or set of files as a new chapter, locally and in repository

```
USAGE
  $ chptr add [NAME] [NUMBER]

ARGUMENTS
  NAME    name of chapter file(s) to add

  NUMBER  force this number to be used, if available.  If this argument is given, the `atnumbered` flag is ignored.
          AtNumbering will be determined by the presence or absence of @ sign.

OPTIONS
  -N, --notify      show a notification box when build is completed.
  -a, --atnumbered  Add an @numbered chapter
  -h, --help        show CLI help
  -p, --path=path   [default: .] Path where root of project files are
```

_See code: [src\commands\add.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\add.ts)_

## `chptr antidote [FILTER]`

Launch Antidote spell-checker for given chapter

```
USAGE
  $ chptr antidote [FILTER]

ARGUMENTS
  FILTER  Chapter number to Antidote.

OPTIONS
  -N, --notify     show a notification box when build is completed.
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\antidote.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\antidote.ts)_

## `chptr build`

Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

```
USAGE
  $ chptr build

OPTIONS
  -N, --notify                                  show a notification box when build is completed.
  -c, --compact                                 Compact chapter numbers at the same time
  -d, --datetimestamp                           adds datetime stamp before output filename
  -h, --help                                    show CLI help
  -p, --path=path                               [default: .] Path where root of project files are
  -r, --removemarkup                            Remove paragraph numbers and other markup in output
  -s, --showWritingRate=all|short|none|export   [default: short] Show word count per day in varying details
  -t, --filetype=md|pdf|docx|html|epub|tex|all  filetype to export to.  Can be set multiple times.

ALIASES
  $ chptr compile
```

_See code: [src\commands\build.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\build.ts)_

## `chptr delete [NAME]`

Delete a chapter or tracked file locally and in the repository

```
USAGE
  $ chptr delete [NAME]

ARGUMENTS
  NAME  chapter number or filename to delete

OPTIONS
  -N, --notify     show a notification box when build is completed.
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are

ALIASES
  $ chptr del
```

_See code: [src\commands\delete.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\delete.ts)_

## `chptr edit [FILTER]`

Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

```
USAGE
  $ chptr edit [FILTER]

ARGUMENTS
  FILTER  Chapter number(s) to modify, comma-separated.

OPTIONS
  -N, --notify                    show a notification box when build is completed.
  -h, --help                      show CLI help
  -p, --path=path                 [default: .] Path where root of project files are
  -t, --type=all|summary|chapter  [default: all] Edit either chapter file, summary file or all.

ALIASES
  $ chptr modify
  $ chptr mod
```

_See code: [src\commands\edit.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\edit.ts)_

## `chptr help [COMMAND]`

display help for chptr

```
USAGE
  $ chptr help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.1.6/src\commands\help.ts)_

## `chptr init [NAME]`

Generates basic config files for a new novel project

```
USAGE
  $ chptr init [NAME]

ARGUMENTS
  NAME  Name of project

OPTIONS
  -N, --notify               show a notification box when build is completed.
  -a, --author=author        Name of author of project
  -e, --email=email          Email of author of project

  -f, --force=force          [default: false] Overwrite config files if they exist.  Specify a filename to overwrite
                             only one; write `true` to overwrite all.

  -h, --help                 show CLI help

  -l, --language=language    Language of project

  -p, --path=path            [default: .] Path where root of project files are

  -r, --gitRemote=gitRemote  Git address of remote repository.

  -s, --style=YAML|JSON5|    Config files in JSON5 or YAML?

ALIASES
  $ chptr setup
```

_See code: [src\commands\init.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\init.ts)_

## `chptr rename [CHAPTERORFILENAME] [NEWNAME]`

Modify chapter title in text, metadata and filename or tracked filename

```
USAGE
  $ chptr rename [CHAPTERORFILENAME] [NEWNAME]

ARGUMENTS
  CHAPTERORFILENAME  Chapter number or tracked filename to modify
  NEWNAME            New chapter name

OPTIONS
  -N, --notify     show a notification box when build is completed.
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
  -t, --title      'Use chapter's title as new name.  Will supercede a `newName` argument.
```

_See code: [src\commands\rename.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\rename.ts)_

## `chptr reorder ORIGIN DESTINATION`

Takes a chapter and modifies its index number to fit another ordering place

```
USAGE
  $ chptr reorder ORIGIN DESTINATION

ARGUMENTS
  ORIGIN       Chapter number to move
  DESTINATION  Number it will become (write `end` or `@end`to put at the end of each stack).

OPTIONS
  -N, --notify     show a notification box when build is completed.
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are

ALIASES
  $ chptr move
```

_See code: [src\commands\reorder.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\reorder.ts)_

## `chptr save [MESSAGE]`

Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.

```
USAGE
  $ chptr save [MESSAGE]

ARGUMENTS
  MESSAGE  Message to use in commit to repository

OPTIONS
  -N, --notify             show a notification box when build is completed.

  -f, --filename=filename  Tracked filename or filename pattern to filter which files to stage before saving to
                           repository

  -h, --help               show CLI help

  -n, --number=number      Chapter number to filter which files to stage before saving to repository

  -p, --path=path          [default: .] Path where root of project files are

  -t, --track              Force tracking of file if not already in repository

ALIASES
  $ chptr commit
```

_See code: [src\commands\save.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\save.ts)_

## `chptr split ORIGIN`

Outputs a chapter file for each `# Title level 1` in an original chapter.

```
USAGE
  $ chptr split ORIGIN

ARGUMENTS
  ORIGIN  Chapter number to split

OPTIONS
  -N, --notify     show a notification box when build is completed.
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are

ALIASES
  $ chptr divide
```

_See code: [src\commands\split.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\split.ts)_

## `chptr track [FILENAME]`

Add a file to be tracked in repository that is not a chapter, summary or metadata file.

```
USAGE
  $ chptr track [FILENAME]

ARGUMENTS
  FILENAME  Filename to track

OPTIONS
  -N, --notify     show a notification box when build is completed.
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\track.ts](https://github.com/spikying/chptr/blob/v0.1.0/src\commands\track.ts)_
<!-- commandsstop -->
