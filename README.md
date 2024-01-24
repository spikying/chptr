oclif-hello-world
=================

oclif example Hello World CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![CircleCI](https://circleci.com/gh/oclif/hello-world/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/hello-world/tree/main)
[![GitHub license](https://img.shields.io/github/license/oclif/hello-world)](https://github.com/oclif/hello-world/blob/main/LICENSE)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g chptr
$ chptr COMMAND
running command...
$ chptr (--version)
chptr/1.0.0 darwin-arm64 node-v20.10.0
$ chptr --help [COMMAND]
USAGE
  $ chptr COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`chptr add [NAME] [NUMBER]`](#chptr-add-name-number)
* [`chptr build`](#chptr-build)
* [`chptr build compact`](#chptr-build-compact)
* [`chptr build metadata`](#chptr-build-metadata)
* [`chptr commit [NUMBERORFILENAME]`](#chptr-commit-numberorfilename)
* [`chptr compile`](#chptr-compile)
* [`chptr del [NAME]`](#chptr-del-name)
* [`chptr delete [NAME]`](#chptr-delete-name)
* [`chptr edit [CHAPTERIDS]`](#chptr-edit-chapterids)
* [`chptr hello PERSON`](#chptr-hello-person)
* [`chptr hello world`](#chptr-hello-world)
* [`chptr help [COMMANDS]`](#chptr-help-commands)
* [`chptr init [NAME]`](#chptr-init-name)
* [`chptr mod [CHAPTERIDS]`](#chptr-mod-chapterids)
* [`chptr modify [CHAPTERIDS]`](#chptr-modify-chapterids)
* [`chptr move [DESTINATIONID] [ORIGINID]`](#chptr-move-destinationid-originid)
* [`chptr plugins`](#chptr-plugins)
* [`chptr plugins:install PLUGIN...`](#chptr-pluginsinstall-plugin)
* [`chptr plugins:inspect PLUGIN...`](#chptr-pluginsinspect-plugin)
* [`chptr plugins:install PLUGIN...`](#chptr-pluginsinstall-plugin-1)
* [`chptr plugins:link PLUGIN`](#chptr-pluginslink-plugin)
* [`chptr plugins:uninstall PLUGIN...`](#chptr-pluginsuninstall-plugin)
* [`chptr plugins reset`](#chptr-plugins-reset)
* [`chptr plugins:uninstall PLUGIN...`](#chptr-pluginsuninstall-plugin-1)
* [`chptr plugins:uninstall PLUGIN...`](#chptr-pluginsuninstall-plugin-2)
* [`chptr plugins update`](#chptr-plugins-update)
* [`chptr rename [CHAPTERIDORFILENAME] [NEWNAME]`](#chptr-rename-chapteridorfilename-newname)
* [`chptr reorder [DESTINATIONID] [ORIGINID]`](#chptr-reorder-destinationid-originid)
* [`chptr save [NUMBERORFILENAME]`](#chptr-save-numberorfilename)
* [`chptr setup [NAME]`](#chptr-setup-name)
* [`chptr track [FILENAME]`](#chptr-track-filename)

## `chptr add [NAME] [NUMBER]`

Adds a file or set of files as a new chapter, locally and in repository

```
USAGE
  $ chptr add [NAME] [NUMBER] [-c]

ARGUMENTS
  NAME    name of chapter to add
  NUMBER  [default: end] force this number to be used, if available.  AtNumbering will be determined by the presence or
          absence of @ sign.  Defaults to `end`.

FLAGS
  -c, --compact  Compact chapter numbers at the same time

DESCRIPTION
  Adds a file or set of files as a new chapter, locally and in repository
```

_See code: [src/commands/add.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/add.ts)_

## `chptr build`

Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

```
USAGE
  $ chptr build [-c] [-d] [-s] [-w yes|no|overwrite] [-P | [-D | ]] [-t md|pdf|docx|html|epub|tex|all] [-i]

FLAGS
  -D, --outputToPreProd             Keep paragraph numbers, but clean markup as if doing an output to Prod.
  -P, --outputToProd                Remove paragraph numbers, clean markup in output and remove chapter titles.  When
                                    false, adds summaries in output.
  -c, --compact                     Compact chapter numbers at the same time
  -d, --datetimestamp               adds datetime stamp before output filename
  -i, --withFullIntermediaryOutput  With full intermediary output as .md file
  -s, --save                        Commit to git at the same time.
  -t, --type=<option>...            filetype to export to.  Can be set multiple times.
                                    <options: md|pdf|docx|html|epub|tex|all>
  -w, --showWritingRate=<option>    [default: yes] Show word count per day.  Overwrite option recalculates it all from
                                    scratch.
                                    <options: yes|no|overwrite>

DESCRIPTION
  Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output
  formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

ALIASES
  $ chptr compile
```

_See code: [src/commands/build/index.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/build/index.ts)_

## `chptr build compact`

Only compacts numbers of files

```
USAGE
  $ chptr build compact [-s]

FLAGS
  -s, --save  Commit to git at the same time.

DESCRIPTION
  Only compacts numbers of files
```

_See code: [src/commands/build/compact.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/build/compact.ts)_

## `chptr build metadata`

Updates only metadata files

```
USAGE
  $ chptr build metadata [-c] [-d] [-s] [-w yes|no|overwrite]

FLAGS
  -c, --compact                   Compact chapter numbers at the same time
  -d, --datetimestamp             adds datetime stamp before output filename
  -s, --save                      Commit to git at the same time.
  -w, --showWritingRate=<option>  [default: yes] Show word count per day.  Overwrite option recalculates it all from
                                  scratch.
                                  <options: yes|no|overwrite>

DESCRIPTION
  Updates only metadata files
```

_See code: [src/commands/build/metadata.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/build/metadata.ts)_

## `chptr commit [NUMBERORFILENAME]`

Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.

```
USAGE
  $ chptr commit [NUMBERORFILENAME] [-c] [-e | -m <value>] [-n <value> | -f <value>] [-t ]

ARGUMENTS
  NUMBERORFILENAME  Chamber number to save, or tracked filename or filename pattern to save to repository

FLAGS
  -c, --compact           Compact chapter numbers at the same time
  -e, --empty             No manual message in commit
  -f, --filename=<value>  Tracked filename or filename pattern to filter which files to stage before saving to
                          repository
  -m, --message=<value>   Message to use in commit to repository
  -n, --number=<value>    Chapter number to filter which files to stage before saving to repository
  -t, --track             Force tracking of file if not already in repository

DESCRIPTION
  Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.

ALIASES
  $ chptr commit
```

## `chptr compile`

Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

```
USAGE
  $ chptr compile [-c] [-d] [-s] [-w yes|no|overwrite] [-P | [-D | ]] [-t md|pdf|docx|html|epub|tex|all] [-i]

FLAGS
  -D, --outputToPreProd             Keep paragraph numbers, but clean markup as if doing an output to Prod.
  -P, --outputToProd                Remove paragraph numbers, clean markup in output and remove chapter titles.  When
                                    false, adds summaries in output.
  -c, --compact                     Compact chapter numbers at the same time
  -d, --datetimestamp               adds datetime stamp before output filename
  -i, --withFullIntermediaryOutput  With full intermediary output as .md file
  -s, --save                        Commit to git at the same time.
  -t, --type=<option>...            filetype to export to.  Can be set multiple times.
                                    <options: md|pdf|docx|html|epub|tex|all>
  -w, --showWritingRate=<option>    [default: yes] Show word count per day.  Overwrite option recalculates it all from
                                    scratch.
                                    <options: yes|no|overwrite>

DESCRIPTION
  Takes all original Markdown files and outputs a single file without metadata and comments.  Handles these output
  formats: md, pdf, docx, html, epub, tex.  Gives some insight into writing rate.

ALIASES
  $ chptr compile
```

## `chptr del [NAME]`

Delete a chapter or tracked file locally and in the repository

```
USAGE
  $ chptr del [NAME] [-c] [-s]

ARGUMENTS
  NAME  chapter number or filename to delete

FLAGS
  -c, --compact  Compact chapter numbers at the same time
  -s, --save     Commit to git at the same time.

DESCRIPTION
  Delete a chapter or tracked file locally and in the repository

ALIASES
  $ chptr del
```

## `chptr delete [NAME]`

Delete a chapter or tracked file locally and in the repository

```
USAGE
  $ chptr delete [NAME] [-c] [-s]

ARGUMENTS
  NAME  chapter number or filename to delete

FLAGS
  -c, --compact  Compact chapter numbers at the same time
  -s, --save     Commit to git at the same time.

DESCRIPTION
  Delete a chapter or tracked file locally and in the repository

ALIASES
  $ chptr del
```

_See code: [src/commands/delete.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/delete.ts)_

## `chptr edit [CHAPTERIDS]`

Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

```
USAGE
  $ chptr edit [CHAPTERIDS] [-t all|summary|chapter]

ARGUMENTS
  CHAPTERIDS  Chapter number(s) to modify, comma-separated or dash-separated for a range.

FLAGS
  -t, --type=<option>  [default: all] Edit either chapter file, summary file or all.
                       <options: all|summary|chapter>

DESCRIPTION
  Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

ALIASES
  $ chptr modify
  $ chptr mod
```

_See code: [src/commands/edit.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/edit.ts)_

## `chptr hello PERSON`

Say hello

```
USAGE
  $ chptr hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/hello/index.ts)_

## `chptr hello world`

Say hello world

```
USAGE
  $ chptr hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ chptr hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/hello/world.ts)_

## `chptr help [COMMANDS]`

Display help for chptr.

```
USAGE
  $ chptr help [COMMANDS] [-n]

ARGUMENTS
  COMMANDS  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for chptr.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.0.12/src/commands/help.ts)_

## `chptr init [NAME]`

Generates basic config files for a new novel project

```
USAGE
  $ chptr init [NAME] [-a <value>] [-d /|chapters/|chapters/number/|] [-e <value>] [-f <value>] [-r
    <value>] [-l <value>] [-s <value>]

ARGUMENTS
  NAME  Name of project

FLAGS
  -a, --author=<value>               Name of author of project
  -d, --directorystructure=<option>  Directory structure initially written in config file
                                     <options: /|chapters/|chapters/number/|>
  -e, --email=<value>                Email of author of project
  -f, --force=<value>                [default: false] Overwrite config files if they exist.  Specify a filename to
                                     overwrite only one; write `true` to overwrite all.
  -l, --language=<value>             Language of project
  -r, --gitRemote=<value>            Git address of remote repository.
  -s, --style=<value>                Config files in JSON5 or YAML?

DESCRIPTION
  Generates basic config files for a new novel project

ALIASES
  $ chptr setup
```

_See code: [src/commands/init.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/init.ts)_

## `chptr mod [CHAPTERIDS]`

Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

```
USAGE
  $ chptr mod [CHAPTERIDS] [-t all|summary|chapter]

ARGUMENTS
  CHAPTERIDS  Chapter number(s) to modify, comma-separated or dash-separated for a range.

FLAGS
  -t, --type=<option>  [default: all] Edit either chapter file, summary file or all.
                       <options: all|summary|chapter>

DESCRIPTION
  Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

ALIASES
  $ chptr modify
  $ chptr mod
```

## `chptr modify [CHAPTERIDS]`

Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

```
USAGE
  $ chptr modify [CHAPTERIDS] [-t all|summary|chapter]

ARGUMENTS
  CHAPTERIDS  Chapter number(s) to modify, comma-separated or dash-separated for a range.

FLAGS
  -t, --type=<option>  [default: all] Edit either chapter file, summary file or all.
                       <options: all|summary|chapter>

DESCRIPTION
  Adjust sentence and paragraph endings to allow for easier editing.  Commit changes with SAVE command.

ALIASES
  $ chptr modify
  $ chptr mod
```

## `chptr move [DESTINATIONID] [ORIGINID]`

Takes a chapter and modifies its index number to fit another ordering place

```
USAGE
  $ chptr move [DESTINATIONID] [ORIGINID] [-c] [-s]

ARGUMENTS
  DESTINATIONID  Number it will become (write `end` or `@end`to put at the end of each stack).
  ORIGINID       Chapter number to move

FLAGS
  -c, --compact  Compact chapter numbers at the same time
  -s, --save     Commit to git at the same time.

DESCRIPTION
  Takes a chapter and modifies its index number to fit another ordering place

ALIASES
  $ chptr move
```

## `chptr plugins`

List installed plugins.

```
USAGE
  $ chptr plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ chptr plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v4.1.21/src/commands/plugins/index.ts)_

## `chptr plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ chptr plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -s, --silent   Silences yarn output.
  -v, --verbose  Show verbose yarn output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ chptr plugins add

EXAMPLES
  $ chptr plugins add myplugin 

  $ chptr plugins add https://github.com/someuser/someplugin

  $ chptr plugins add someuser/someplugin
```

## `chptr plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ chptr plugins:inspect PLUGIN...

ARGUMENTS
  PLUGIN  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ chptr plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v4.1.21/src/commands/plugins/inspect.ts)_

## `chptr plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ chptr plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -s, --silent   Silences yarn output.
  -v, --verbose  Show verbose yarn output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ chptr plugins add

EXAMPLES
  $ chptr plugins install myplugin 

  $ chptr plugins install https://github.com/someuser/someplugin

  $ chptr plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v4.1.21/src/commands/plugins/install.ts)_

## `chptr plugins:link PLUGIN`

Links a plugin into the CLI for development.

```
USAGE
  $ chptr plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help      Show CLI help.
  -v, --verbose
  --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ chptr plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v4.1.21/src/commands/plugins/link.ts)_

## `chptr plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ chptr plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ chptr plugins unlink
  $ chptr plugins remove

EXAMPLES
  $ chptr plugins remove myplugin
```

## `chptr plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ chptr plugins reset
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v4.1.21/src/commands/plugins/reset.ts)_

## `chptr plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ chptr plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ chptr plugins unlink
  $ chptr plugins remove

EXAMPLES
  $ chptr plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v4.1.21/src/commands/plugins/uninstall.ts)_

## `chptr plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ chptr plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ chptr plugins unlink
  $ chptr plugins remove

EXAMPLES
  $ chptr plugins unlink myplugin
```

## `chptr plugins update`

Update installed plugins.

```
USAGE
  $ chptr plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v4.1.21/src/commands/plugins/update.ts)_

## `chptr rename [CHAPTERIDORFILENAME] [NEWNAME]`

Modify chapter title in text, metadata and filename or tracked filename

```
USAGE
  $ chptr rename [CHAPTERIDORFILENAME] [NEWNAME] [-a -t] [-s]

ARGUMENTS
  CHAPTERIDORFILENAME  Chapter number or tracked filename to modify
  NEWNAME              New chapter name

FLAGS
  -a, --all    Will run on every chapter file.  Will ignore a `chapterIdOrFilename argument.`
  -s, --save   Commit to git at the same time.
  -t, --title  Use chapter's title as new name.  Will supercede a `newName` argument.

DESCRIPTION
  Modify chapter title in text, metadata and filename or tracked filename
```

_See code: [src/commands/rename.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/rename.ts)_

## `chptr reorder [DESTINATIONID] [ORIGINID]`

Takes a chapter and modifies its index number to fit another ordering place

```
USAGE
  $ chptr reorder [DESTINATIONID] [ORIGINID] [-c] [-s]

ARGUMENTS
  DESTINATIONID  Number it will become (write `end` or `@end`to put at the end of each stack).
  ORIGINID       Chapter number to move

FLAGS
  -c, --compact  Compact chapter numbers at the same time
  -s, --save     Commit to git at the same time.

DESCRIPTION
  Takes a chapter and modifies its index number to fit another ordering place

ALIASES
  $ chptr move
```

_See code: [src/commands/reorder.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/reorder.ts)_

## `chptr save [NUMBERORFILENAME]`

Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.

```
USAGE
  $ chptr save [NUMBERORFILENAME] [-c] [-e | -m <value>] [-n <value> | -f <value>] [-t ]

ARGUMENTS
  NUMBERORFILENAME  Chamber number to save, or tracked filename or filename pattern to save to repository

FLAGS
  -c, --compact           Compact chapter numbers at the same time
  -e, --empty             No manual message in commit
  -f, --filename=<value>  Tracked filename or filename pattern to filter which files to stage before saving to
                          repository
  -m, --message=<value>   Message to use in commit to repository
  -n, --number=<value>    Chapter number to filter which files to stage before saving to repository
  -t, --track             Force tracking of file if not already in repository

DESCRIPTION
  Parse modified text files, adjust sentence and paragraph endings, and commit files to repository.

ALIASES
  $ chptr commit
```

_See code: [src/commands/save.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/save.ts)_

## `chptr setup [NAME]`

Generates basic config files for a new novel project

```
USAGE
  $ chptr setup [NAME] [-a <value>] [-d /|chapters/|chapters/number/|] [-e <value>] [-f <value>] [-r
    <value>] [-l <value>] [-s <value>]

ARGUMENTS
  NAME  Name of project

FLAGS
  -a, --author=<value>               Name of author of project
  -d, --directorystructure=<option>  Directory structure initially written in config file
                                     <options: /|chapters/|chapters/number/|>
  -e, --email=<value>                Email of author of project
  -f, --force=<value>                [default: false] Overwrite config files if they exist.  Specify a filename to
                                     overwrite only one; write `true` to overwrite all.
  -l, --language=<value>             Language of project
  -r, --gitRemote=<value>            Git address of remote repository.
  -s, --style=<value>                Config files in JSON5 or YAML?

DESCRIPTION
  Generates basic config files for a new novel project

ALIASES
  $ chptr setup
```

## `chptr track [FILENAME]`

Add a file to be tracked in repository that is not a chapter, summary or metadata file.

```
USAGE
  $ chptr track [FILENAME]

ARGUMENTS
  FILENAME  Filename to track

DESCRIPTION
  Add a file to be tracked in repository that is not a chapter, summary or metadata file.
```

_See code: [src/commands/track.ts](https://github.com/spikying/chptr/blob/v1.0.0/src/commands/track.ts)_
<!-- commandsstop -->
