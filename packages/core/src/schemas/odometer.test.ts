import { describe, expect, it } from 'vitest'
import { odometerReadingSchema } from './odometer'

describe('odometerReadingSchema', () => {
  it('accepts whole miles with commas and spaces around them', () => {
    expect(odometerReadingSchema.parse(' 36,500 ')).toBe(36_500)
  })

  it('rejects decimals, units and empty input', () => {
    for (const value of ['36500.5', '36k', '', '-5'])
      expect(odometerReadingSchema.safeParse(value).success).toBe(false)
  })

  it('rejects more than two million miles', () => {
    expect(odometerReadingSchema.safeParse('2,000,001').error?.issues[0]?.message).toBe(
      'That is too many miles',
    )
  })
})
