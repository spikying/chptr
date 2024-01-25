import * as chalk from 'chalk'

const debug = require('debug')('string-overload')

export const actionStartColor = function (msg: string) {
  debug(`in action start color for ${JSON.stringify(msg)}`)
  return chalk.blue(msg)
}

export const actionStopColor = function (msg: string) {
  return chalk.cyan(msg)
}

export const resultHighlighColor = function (msg: string) {
  return chalk.yellow(msg)
}

export const resultSecondaryColor = function (msg: string) {
  return chalk.magenta(msg)
}

export const resultNormalColor = function (msg: string) {
  return chalk.whiteBright(msg)
}

export const infoColor = function (msg: string) {
  return chalk.gray(msg)
}

export const errorColor = function (msg: string) {
  return chalk.redBright(msg)
}

export const normalColor = function (msg: string) {
  return chalk.white(msg)
}

/*
Colors
  black
  red
  green
  yellow
  blue
  magenta
  cyan
  white
  gray ("bright black")
  redBright
  greenBright
  yellowBright
  blueBright
  magentaBright
  cyanBright
  whiteBright
Background colors
  bgBlack
  bgRed
  bgGreen
  bgYellow
  bgBlue
  bgMagenta
  bgCyan
  bgWhite
  bgBlackBright
  bgRedBright
  bgGreenBright
  bgYellowBright
  bgBlueBright
  bgMagentaBright
  bgCyanBright
  bgWhiteBright
256 and Truecolor color support
  rgb - Example: chalk.rgb(255, 136, 0).bold('Orange!')
  hex - Example: chalk.hex('#FF8800').bold('Orange!')
  keyword (CSS keywords) - Example: chalk.keyword('orange').bold('Orange!')
  hsl - Example: chalk.hsl(32, 100, 50).bold('Orange!')
  hsv - Example: chalk.hsv(32, 100, 100).bold('Orange!')
  hwb - Example: chalk.hwb(32, 0, 50).bold('Orange!')
  ansi16
  ansi256
*/
