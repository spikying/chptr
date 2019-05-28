import {expect, test} from '@oclif/test'
import * as assert from 'assert'

import {numDigits, stringifyNumber, walk} from '../src/helpers'

describe('Helpers numDigits', () => {
  it('should give 1 digit for input "2"', () => {
    const res = numDigits(2)
    assert.strictEqual(res, 1)
  })

  it('should give 2 digit for input "8"', () => {
    const res = numDigits(8)
    assert.strictEqual(res, 2)
  })

  it('should give 1 digit for input "0"', () => {
    const res = numDigits(0)
    assert.strictEqual(res, 1)
  })

  it('should give 1 digit for input "-2"', () => {
    const res = numDigits(-2)
    assert.strictEqual(res, 1)
  })

  it('should give 2 digits for input "25"', () => {
    const res = numDigits(25)
    assert.strictEqual(res, 2)
  })

  it('should give 3 digit for input "98"', () => {
    const res = numDigits(98)
    assert.strictEqual(res, 3)
  })

  it('should give 3 digit for input "90" with buffer of 10', () => {
    const res = numDigits(90, 10)
    assert.strictEqual(res, 3)
  })

  it('should give 3 digit for input "105"', () => {
    const res = numDigits(105)
    assert.strictEqual(res, 3)
  })
})

describe('Helpers stringifyNumber', () => {
  it('should give "2" for input "2,1"', () => {
    const res = stringifyNumber(2, 1)
    assert.strictEqual(res, '2')
  })

  it('should give "02" for input "2,2"', () => {
    const res = stringifyNumber(2, 2)
    assert.strictEqual(res, '02')
  })

  it('should give "002" for input "2,3"', () => {
    const res = stringifyNumber(2, 3)
    assert.strictEqual(res, '002')
  })
})

describe('Helpers walk', () => {
  it('should see 5 files/dir in node_modules/@oclif/test when not deep', async () => {
    await walk('./node_modules/@oclif/test', false, 0, (err, result) => {
      assert.strictEqual(result.length, 5)
      // done()
    })
    // done()
  })
})
