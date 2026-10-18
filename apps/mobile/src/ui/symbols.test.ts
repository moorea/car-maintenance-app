import { describe, expect, it } from 'vitest'
import { leadingWidth } from './symbols'

describe('leadingWidth', () => {
  it('leaves room for the widest leading symbol, which draws about 1.4 times its size', () => {
    expect(leadingWidth(22)).toBeGreaterThanOrEqual(22 * 1.4)
  })

  it('is a whole number of points, so rows of the same icon size line up exactly', () => {
    expect(Number.isInteger(leadingWidth(17))).toBe(true)
  })
})
