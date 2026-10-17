import { describe, expect, it } from 'vitest'
import { isGeneralGuidance } from './schedule'

describe('isGeneralGuidance', () => {
  it('is true for the baseline schedule', () => {
    expect(isGeneralGuidance([{ source: 'baseline' }, { source: 'baseline' }])).toBe(true)
  })

  it("is false for a provider's schedule", () => {
    expect(isGeneralGuidance([{ source: 'motor' }])).toBe(false)
  })

  it('is false for an empty schedule or items with no source', () => {
    expect(isGeneralGuidance([])).toBe(false)
    expect(isGeneralGuidance([{}])).toBe(false)
  })
})
