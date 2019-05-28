import {expect, test} from '@oclif/test'

describe('reorder', () => {
  test
    .command(['reorder'])
    .exit(2)
    .it('exits with 0 args')

  test
    .command(['reorder', '2'])
    .exit(2)
    .it('exits with 1 args')

  test
    .stdout()
    .command(['reorder', '2', '1'])
    .it('runs reorder 2 1', ctx => {
      expect(ctx.stdout).to.contain('hello jeff')
    })
})
