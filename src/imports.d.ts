// declare module 'simple-pandoc';
declare module 'ps-node'

declare interface String {
  color: any
  actionStartColor(): string
  actionStopColor(): string
  resultHighlighColor(): string
  resultSecondaryColor(): string
  resultNormalColor(): string
  infoColor(): string
  errorColor(): string
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
