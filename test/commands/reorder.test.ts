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
    .command(['reorder', '2', '1', '--path=../testNovel'])
    .it('runs reorder 2 1 --path="../testNovel"', ctx => {
      expect(ctx).not.to.throw
    })
})
