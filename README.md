# chptr

Command Line tool to handle separate Markdown files with special markup notations and export as a complete document.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/chptr.svg)](https://npmjs.org/package/chptr)
[![Downloads/week](https://img.shields.io/npm/dw/chptr.svg)](https://npmjs.org/package/chptr)
[![License](https://img.shields.io/npm/l/chptr.svg)](https://github.com/spikying/chptr/blob/master/package.json)

It is aimed at helping writing fiction, but could be used for managing any complicated long document.

# Table of Contents

<!-- toc -->
* [chptr](#chptr)
* [Table of Contents](#table-of-contents)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

## Key features

- Wrapping [Git](https://git-scm.com/) basic functions for versionning and remote repository backup
- Wrapping [Pandoc](https://pandoc.org/) basic functions for building assembled files in Markdown (.md), Word (.docx), LaTex (.tex), PDF (.pdf), Html (.html) and ePub (.epub).
- Every "chapter" has three files:
  - Main content, in Markdown (.chptr file)
  - Summary content, in Markdown (.md file)
  - Metadata, in either YAML or JSON5.
- Commands to
  - `Init` a new project and create a few required files
  - `Add` new chapters
  - `Delete` chapters
  - `Reorder` chapters
  - `Build` output and recomputing some metadata
  - Help with `Antidote` [language checker](https://antidote.info/) workflow
  - `Save` to repository, in sentence-by-line style
  - Put chapters back to `Edit` mode, by removing paragraph markup and bringing back file in paragraphs
  - `Rename` chapters
  - `Split` chapters when many first-level titles are found in them
  - `Track` other files in repository system, for notes-taking
- An extension is available for [Antidote](https://antidote.info/) spell-checker workflow in [Github](https://github.com/spikying/chptr-antidote-plugin) and [npm](https://www.npmjs.com/package/chptr-antidote-plugin)

## Philosophy

That project was (and is still) a personal take on the fiction (and non-fiction) writing softwares. I like to separate content from format<sup id="l1">[1](#f1)</sup>, track all references and notes as I write<sup id="l2">[2](#f2)</sup>, have precise history of the files with source control<sup id="l3">[3](#f3)</sup>, and use the editing software of my choice<sup id="l4">[4](#f4)</sup>. Many other tools exist and have other philosophies, and they fit better for most people. They just don't work so well for me. This is a geeky tool, that I wanted to be simple (even if it is growing to be more than I first expected). It is aimed at me alone, but if you're another geek that thinks like me, enjoy, I hope you like it.

- Every file has LF (\n) line endings; CRLF (\r\n) are converted. You can still work on Windows but the original Notepad won't do.
- Every file is a UTF8 file without BOM. When sending a file to [Antidote](#chptr-antidote-filter), files are converted to UTF8-BOM (because of limitations in that software) and have a .antidote extension added. When the Antidote work is done, that file is processed back to its original extension and the .antidote one is deleted.
- Sentences are marked by a sentence termination character _and two spaces_. In the output files, the parsers will take all those double-spaces and convert them to single-spaces. That helps Chptr to identify sentence endings and put them on separate lines before saving them to repository, helping track evolution of the text with Git tools on a sentence-by-sentence basis, instead of paragraph-by-paragraph basis.
- Metadata written inline has this structure: `{key: possibly long value}`. In the output, this metadata is either kept (and visually reorganized) or removed completely (for eventual outside review and publishing), depending on a `--removemarkup` flag in the `build` command. It is parsed and indexed in some metadata files.
- Characters, places, hints (and possibly any other important things to track) have a special notation too, called **props**: `{Batman} is a superhero in Gotham City.` In this case, the word(s) between the brackets are kept in the output, either with ou without some outlining, depending on the `--removemarkup` flag of the `build` command again. They are indexed also in some metadata files to help finding them back easily.
- Config folder has a few files that can be customized to fit many preferences:
  - YAML vs JSON5
  - Project's title, language, file naming patterns, etc.
  - What to put in an empty (new) chapter
  - What manual fields to track on each chapter's metadata

<b id="f1">[1]:</b> Pandoc does that[↩](#l1)

<b id="f2">[2]:</b> The markup format that I use to extend Markdown does that[↩](#l2)

<b id="f3">[3]:</b> Git does that[↩](#l3)

<b id="f1">[4]:</b> VSCode is nice![↩](#l4)

## Prerequisites

To make it work, you'll need to have [Git](https://git-scm.com/) and [Pandoc](https://pandoc.org/) globally installed first (refer to those sites to download and install if needed). Also, [Node](https://nodejs.org) (with it's companion NPM) are necessary to use as explained down here. There are ways to build a standalone executable from there but I won't publish those online, as I expect that if you want to use this tool, you probably already have Node and NPM installed. Instructions on how to build those executables is described [here](https://oclif.io/docs/releasing#standalone-tarballs).

## Roadmap, todos and warnings

This app doesn't have tests at this point, is not documented and will be liberately refactored as intensely as needed. **It is not mature at all** but I decided I wouldn't wait until it was to open-source it. Any and all breaking changes may appear between now and version 1.0.0.

In some future, I wish to do these things:

- Include all sorts of tests
- Document properly
- Improve the code structure, code reusability and general code cleanliness

# Usage

<!-- usage -->
```sh-session
$ npm install -g chptr
$ chptr COMMAND
running command...
$ chptr (-v|--version|version)
chptr/0.3.5 win32-x64 node-v12.18.3
$ chptr --help [COMMAND]
USAGE
  $ chptr COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`chptr add [NUMBER] [NAME]`](#chptr-add-number-name)
* [`chptr build`](#chptr-build)
* [`chptr build:compact`](#chptr-buildcompact)
* [`chptr build:metadata`](#chptr-buildmetadata)
* [`chptr build:output`](#chptr-buildoutput)
* [`chptr delete [NAME]`](#chptr-delete-name)
* [`chptr edit [CHAPTERIDS]`](#chptr-edit-chapterids)
* [`chptr help [COMMAND]`](#chptr-help-command)
* [`chptr init [NAME]`](#chptr-init-name)
* [`chptr plugins`](#chptr-plugins)
* [`chptr plugins:install PLUGIN...`](#chptr-pluginsinstall-plugin)
* [`chptr plugins:link PLUGIN`](#chptr-pluginslink-plugin)
* [`chptr plugins:uninstall PLUGIN...`](#chptr-pluginsuninstall-plugin)
* [`chptr plugins:update`](#chptr-pluginsupdate)
* [`chptr rename [CHAPTERIDORFILENAME] [NEWNAME]`](#chptr-rename-chapteridorfilename-newname)
* [`chptr reorder [ORIGINID] [DESTINATIONID]`](#chptr-reorder-originid-destinationid)
* [`chptr save [NUMBERORFILENAME]`](#chptr-save-numberorfilename)
* [`chptr track [FILENAME]`](#chptr-track-filename)

## `chptr add [NUMBER] [NAME]`

Adds a file or set of files as a new chapter, locally and in repository

```
USAGE
  $ chptr add [NUMBER] [NAME]

ARGUMENTS
  NUMBER  [default: end] force this number to be used, if available.  AtNumbering will be determined by the presence or
          absence of @ sign.  Defaults to `end`.

  NAME    name of chapter to add

OPTIONS
  -N, --notify     show a notification box when command is completed.
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\add.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\add.ts)_

## `chptr build`

Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

```
USAGE
  $ chptr build

OPTIONS
  -D, --outputToPreProd                     Keep paragraph numbers, but clean markup as if doing an output to Prod.
  -N, --notify                              show a notification box when command is completed.

  -P, --outputToProd                        Remove paragraph numbers, clean markup in output and remove chapter titles.
                                            When false, adds summaries in output.

  -c, --compact                             Compact chapter numbers at the same time

  -d, --datetimestamp                       adds datetime stamp before output filename

  -h, --help                                show CLI help

  -i, --withFullIntermediaryOutput          With full intermediary output as .md file

  -p, --path=path                           [default: .] Path where root of project files are

  -s, --save                                Commit to git at the same time.

  -t, --type=md|pdf|docx|html|epub|tex|all  filetype to export to.  Can be set multiple times.

  -w, --showWritingRate=yes|no|overwrite    [default: yes] Show word count per day.  Overwrite option recalculates it
                                            all from scratch.

ALIASES
  $ chptr compile
```

_See code: [src\commands\build\index.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\build\index.ts)_

## `chptr build:compact`

Only compacts numbers of files

```
USAGE
  $ chptr build:compact

OPTIONS
  -N, --notify     show a notification box when command is completed.
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
  -s, --save       Commit to git at the same time.
```

_See code: [src\commands\build\compact.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\build\compact.ts)_

## `chptr build:metadata`

Updates only metadata files

```
USAGE
  $ chptr build:metadata

OPTIONS
  -N, --notify                            show a notification box when command is completed.
  -c, --compact                           Compact chapter numbers at the same time
  -d, --datetimestamp                     adds datetime stamp before output filename
  -h, --help                              show CLI help
  -p, --path=path                         [default: .] Path where root of project files are
  -s, --save                              Commit to git at the same time.

  -w, --showWritingRate=yes|no|overwrite  [default: yes] Show word count per day.  Overwrite option recalculates it all
                                          from scratch.
```

_See code: [src\commands\build\metadata.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\build\metadata.ts)_

## `chptr build:output`

Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

```
USAGE
  $ chptr build:output

OPTIONS
  -N, --notify                              show a notification box when command is completed.

  -P, --outputToProd                        Remove paragraph numbers, clean markup in output and remove chapter titles.
                                            When false, adds summaries in output.

  -c, --compact                             Compact chapter numbers at the same time

  -d, --datetimestamp                       adds datetime stamp before output filename

  -h, --help                                show CLI help

  -i, --withFullIntermediaryOutput          With full intermediary output as .md file

  -p, --path=path                           [default: .] Path where root of project files are

  -s, --save                                Commit to git at the same time.

  -t, --type=md|pdf|docx|html|epub|tex|all  filetype to export to.  Can be set multiple times.

  -w, --showWritingRate=yes|no|overwrite    [default: yes] Show word count per day.  Overwrite option recalculates it
                                            all from scratch.

ALIASES
  $ chptr compile
```

_See code: [src\commands\build\output.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\build\output.ts)_

## `chptr delete [NAME]`

Delete a chapter or tracked file locally and in the repository

```
USAGE
  $ chptr delete [NAME]

ARGUMENTS
  NAME  chapter number or filename to delete

OPTIONS
  -N, --notify     show a notification box when command is completed.
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
  -s, --save       Commit to git at the same time.

ALIASES
  $ chptr del
```

_See code: [src\commands\delete.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\delete.ts)_

## `chptr edit [CHAPTERIDS]`

Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

```
USAGE
  $ chptr edit [CHAPTERIDS]

ARGUMENTS
  CHAPTERIDS  Chapter number(s) to modify, comma-separated or dash-separated for a range.

OPTIONS
  -N, --notify                    show a notification box when command is completed.
  -h, --help                      show CLI help
  -p, --path=path                 [default: .] Path where root of project files are
  -t, --type=all|summary|chapter  [default: all] Edit either chapter file, summary file or all.

ALIASES
  $ chptr modify
  $ chptr mod
```

_See code: [src\commands\edit.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\edit.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.1.0/src\commands\help.ts)_

## `chptr init [NAME]`

Generates basic config files for a new novel project

```
USAGE
  $ chptr init [NAME]

ARGUMENTS
  NAME  Name of project

OPTIONS
  -N, --notify                                            show a notification box when command is completed.
  -a, --author=author                                     Name of author of project
  -d, --directorystructure=/|chapters/|chapters/number/|  Directory structure initially written in config file
  -e, --email=email                                       Email of author of project

  -f, --force=force                                       [default: false] Overwrite config files if they exist.
                                                          Specify a filename to overwrite only one; write `true` to
                                                          overwrite all.

  -h, --help                                              show CLI help

  -l, --language=language                                 Language of project

  -p, --path=path                                         [default: .] Path where root of project files are

  -r, --gitRemote=gitRemote                               Git address of remote repository.

  -s, --style=style                                       Config files in JSON5 or YAML?

ALIASES
  $ chptr setup
```

_See code: [src\commands\init.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\init.ts)_

## `chptr plugins`

list installed plugins

```
USAGE
  $ chptr plugins

OPTIONS
  --core  show core plugins

EXAMPLE
  $ chptr plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v1.9.0/src\commands\plugins\index.ts)_

## `chptr plugins:install PLUGIN...`

installs a plugin into the CLI

```
USAGE
  $ chptr plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  plugin to install

OPTIONS
  -f, --force    yarn install with force flag
  -h, --help     show CLI help
  -v, --verbose

DESCRIPTION
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command 
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in 
  the CLI without the need to patch and update the whole CLI.

ALIASES
  $ chptr plugins:add

EXAMPLES
  $ chptr plugins:install myplugin 
  $ chptr plugins:install https://github.com/someuser/someplugin
  $ chptr plugins:install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v1.9.0/src\commands\plugins\install.ts)_

## `chptr plugins:link PLUGIN`

links a plugin into the CLI for development

```
USAGE
  $ chptr plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

OPTIONS
  -h, --help     show CLI help
  -v, --verbose

DESCRIPTION
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello' 
  command will override the user-installed or core plugin implementation. This is useful for development work.

EXAMPLE
  $ chptr plugins:link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v1.9.0/src\commands\plugins\link.ts)_

## `chptr plugins:uninstall PLUGIN...`

removes a plugin from the CLI

```
USAGE
  $ chptr plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

OPTIONS
  -h, --help     show CLI help
  -v, --verbose

ALIASES
  $ chptr plugins:unlink
  $ chptr plugins:remove
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v1.9.0/src\commands\plugins\uninstall.ts)_

## `chptr plugins:update`

update installed plugins

```
USAGE
  $ chptr plugins:update

OPTIONS
  -h, --help     show CLI help
  -v, --verbose
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v1.9.0/src\commands\plugins\update.ts)_

## `chptr rename [CHAPTERIDORFILENAME] [NEWNAME]`

Modify chapter title in text, metadata and filename or tracked filename

```
USAGE
  $ chptr rename [CHAPTERIDORFILENAME] [NEWNAME]

ARGUMENTS
  CHAPTERIDORFILENAME  Chapter number or tracked filename to modify
  NEWNAME              New chapter name

OPTIONS
  -N, --notify     show a notification box when command is completed.
  -a, --all        Will run on every chapter file.  Will ignore a `chapterIdOrFilename argument.`
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
  -s, --save       Commit to git at the same time.
  -t, --title      Use chapter's title as new name.  Will supercede a `newName` argument.
```

_See code: [src\commands\rename.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\rename.ts)_

## `chptr reorder [ORIGINID] [DESTINATIONID]`

Takes a chapter and modifies its index number to fit another ordering place

```
USAGE
  $ chptr reorder [ORIGINID] [DESTINATIONID]

ARGUMENTS
  ORIGINID       Chapter number to move
  DESTINATIONID  Number it will become (write `end` or `@end`to put at the end of each stack).

OPTIONS
  -N, --notify     show a notification box when command is completed.
  -c, --compact    Compact chapter numbers at the same time
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
  -s, --save       Commit to git at the same time.

ALIASES
  $ chptr move
```

_See code: [src\commands\reorder.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\reorder.ts)_

## `chptr save [NUMBERORFILENAME]`

Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.

```
USAGE
  $ chptr save [NUMBERORFILENAME]

ARGUMENTS
  NUMBERORFILENAME  Chamber number to save, or tracked filename or filename pattern to save to repository

OPTIONS
  -N, --notify             show a notification box when command is completed.
  -e, --empty              No manual message in commit

  -f, --filename=filename  Tracked filename or filename pattern to filter which files to stage before saving to
                           repository

  -h, --help               show CLI help

  -m, --message=message    Message to use in commit to repository

  -n, --number=number      Chapter number to filter which files to stage before saving to repository

  -p, --path=path          [default: .] Path where root of project files are

  -t, --track              Force tracking of file if not already in repository

ALIASES
  $ chptr commit
```

_See code: [src\commands\save.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\save.ts)_

## `chptr track [FILENAME]`

Add a file to be tracked in repository that is not a chapter, summary or metadata file.

```
USAGE
  $ chptr track [FILENAME]

ARGUMENTS
  FILENAME  Filename to track

OPTIONS
  -N, --notify     show a notification box when command is completed.
  -h, --help       show CLI help
  -p, --path=path  [default: .] Path where root of project files are
```

_See code: [src\commands\track.ts](https://github.com/spikying/chptr/blob/v0.3.5/src\commands\track.ts)_
<!-- commandsstop -->
