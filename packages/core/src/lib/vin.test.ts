import { describe, expect, it } from 'vitest'
import { normalizeVin, vinCheckDigit, vinProblem } from './vin'

describe('VIN checks', () => {
  it('accepts real VINs, including one whose check digit is X', () => {
    expect(vinProblem('1HGCM82633A004352')).toBeUndefined()
    expect(vinProblem('1M8GDM9AXKP042788')).toBeUndefined()
    expect(vinCheckDigit('1M8GDM9AXKP042788')).toBe('X')
  })

  it('catches a single mistyped character through the check digit', () => {
    expect(vinProblem('1HGCM82633A004353')).toBe('check-digit')
  })

  it('rejects VINs of the wrong length', () => {
    expect(vinProblem('1HGCM82633A00435')).toBe('length')
    expect(vinProblem('')).toBe('length')
  })

  it('rejects the letters I, O and Q, which VINs never use', () => {
    expect(vinProblem('1HGCM8263OA004352')).toBe('characters')
  })

  it('ignores case, spaces and dashes', () => {
    expect(normalizeVin(' 1hgcm 8263-3a004352 ')).toBe('1HGCM82633A004352')
  })
})
