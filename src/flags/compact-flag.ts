import { Flags } from '@oclif/core'

export const compact = Flags.boolean({
  char: 'c',
  description: 'Compact chapter numbers at the same time',
  default: false
})
