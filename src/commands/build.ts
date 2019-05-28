import {Command, flags} from '@oclif/command'
import cli from 'cli-ux'
// import {boolean} from '@oclif/parser/lib/flags'
import * as fs from 'fs'
import * as inquirer from 'inquirer'
import * as notifier from 'node-notifier'

export default class Build extends Command {
  static description =
    'Takes all original .MD files and outputs a single .MD file without metadata and comments.  Adds missing files to index file.'

  static flags = {
    help: flags.help({char: 'h'}),
    // flag with a value (-o, --overwrite=yes)
    overwrite: flags.string({
      char: 'o',
      description: 'allows overwriting output file if it exists',
      options: ['y', 'n', 'prompt'],
      default: 'prompt'
    }),
    notify: flags.boolean({
      char: 'n',
      description:
        'show a notification box when build is completed.  Use --no-notify to suppress notification',
      default: true,
      allowNo: true
    })
  }

  static args = [
    {
      name: 'tocfile',
      default: './index.json',
      description: 'input file containing all referenced files'
    },
    {
      name: 'outputfile',
      default: './novel.md',
      description: "output file concatenating all other files's contents"
    }
  ]

  async run() {
    const {args, flags} = this.parse(Build)

    const outputFile = args.outputfile
    let overwrite = flags.overwrite
    if (overwrite === 'prompt') {
      await fs.access(args.outputfile, async err => {
        if (!err) {
          const responses: any = await inquirer.prompt([
            {
              name: 'overwrite',
              message: `Do you want to overwrite ${outputFile}? (y/n)`,
              type: 'list',
              choices: ['y', 'n']
            }
          ])
          overwrite = responses.overwrite
        }
      })
    }
    const overwriting = overwrite === 'y' ? true : false
    this.log(`Overwriting ${outputFile} : ${overwriting}.`)

    const tocFile=args.tocfile
    

    cli.action.start('Parsing all files')
    await cli.wait(3000)
    cli.action.stop()

    if (flags.notify) {
      notifier.notify({
        title: 'Spix Novel Builder',
        message: 'Build complete'
      })
    }
  }
}
