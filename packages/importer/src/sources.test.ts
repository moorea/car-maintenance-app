import { describe, expect, it } from 'vitest'
import { coversEveryYear, FALLBACK_SOURCES, sourcesFor, sourcesFromPage } from './sources.ts'

describe('sources', () => {
  it("finds the chunked files linked from NHTSA's page, each once", () => {
    const html = `
      <a href="https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS_RECEIVED_2020-2024.zip">x</a>
      <a href="https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS_RECEIVED_2020-2024.zip">x</a>
      <a href="https://static.nhtsa.gov/odi/ffdd/cmpl/COMPLAINTS_RECEIVED_2025-2026.zip">x</a>
      <a href="https://static.nhtsa.gov/odi/ffdd/cmpl/FLAT_CMPL.zip">all</a>
      <a href="https://static.nhtsa.gov/odi/ffdd/tsbs/MFR_COMMS_RECEIVED_2020-2024.zip">summary only</a>`
    expect(sourcesFromPage(html)).toEqual([
      {
        kind: 'bulletins',
        url: 'https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS_RECEIVED_2020-2024.zip',
        from: 2020,
        to: 2024,
      },
      {
        kind: 'complaints',
        url: 'https://static.nhtsa.gov/odi/ffdd/cmpl/COMPLAINTS_RECEIVED_2025-2026.zip',
        from: 2025,
        to: 2026,
      },
    ])
  })

  it('reads only the chunks received since the year before the oldest model year', () => {
    const picked = sourcesFor(FALLBACK_SOURCES, [2021, 2017])
    expect(new Set(picked.map((s) => s.from))).toEqual(new Set([2015, 2020, 2025]))
    expect(picked.filter((s) => s.kind === 'bulletins')).toHaveLength(3)
  })

  it('reads nothing when nobody owns a car', () => {
    expect(sourcesFor(FALLBACK_SOURCES, [])).toEqual([])
  })

  it('trusts a page only when it lists every year of both kinds', () => {
    expect(coversEveryYear(FALLBACK_SOURCES, 2026)).toBe(true)
    expect(coversEveryYear(FALLBACK_SOURCES, 2027)).toBe(false)
    const withoutOld = FALLBACK_SOURCES.filter((s) => !(s.kind === 'bulletins' && s.from < 2020))
    expect(coversEveryYear(withoutOld, 2026)).toBe(false)
    const withGap = FALLBACK_SOURCES.filter((s) => s.from !== 2010)
    expect(coversEveryYear(withGap, 2026)).toBe(false)
  })
})
