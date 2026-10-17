/**
 * Where NHTSA's bulk files are. Both are split into chunks by the year NHTSA received the record
 * ("MFR_COMMS_RECEIVED_2020-2024.zip"), and new chunks appear as years pass, so the list is read
 * from NHTSA's datasets page, with the chunks known when this was written as a fallback.
 */

export type SourceKind = 'bulletins' | 'complaints'

export interface Source {
  kind: SourceKind
  url: string
  /** The years NHTSA received its records in. */
  from: number
  to: number
}

export const DATASETS_PAGE = 'https://www.nhtsa.gov/nhtsa-datasets-and-apis'

const BASE = 'https://static.nhtsa.gov/odi/ffdd'
const PATTERN =
  /https:\/\/static\.nhtsa\.gov\/odi\/ffdd\/(tsbs\/MFR_COMMS|cmpl\/COMPLAINTS)_RECEIVED_(\d{4})-(\d{4})\.zip/g

const FALLBACK_RANGES = [
  [1995, 1999],
  [2000, 2004],
  [2005, 2009],
  [2010, 2014],
  [2015, 2019],
  [2020, 2024],
  [2025, 2026],
] as const

export const FALLBACK_SOURCES: Source[] = FALLBACK_RANGES.flatMap(([from, to]) => [
  { kind: 'bulletins', url: `${BASE}/tsbs/MFR_COMMS_RECEIVED_${from}-${to}.zip`, from, to },
  { kind: 'complaints', url: `${BASE}/cmpl/COMPLAINTS_RECEIVED_${from}-${to}.zip`, from, to },
])

/** The chunked files linked from NHTSA's datasets page, each once. */
export const sourcesFromPage = (html: string): Source[] => {
  const found = new Map<string, Source>()
  for (const m of html.matchAll(PATTERN)) {
    const [url, path, from, to] = m as unknown as [string, string, string, string]
    found.set(url, {
      kind: path.startsWith('tsbs') ? 'bulletins' : 'complaints',
      url,
      from: Number(from),
      to: Number(to),
    })
  }
  return [...found.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.from - b.from)
}

/**
 * The files that can hold records about the given model years. A model year goes on sale the
 * year before, and records keep arriving for as long as the cars are on the road, so every chunk
 * received from the year before the oldest model year on is read.
 */
export const sourcesFor = (sources: Source[], years: number[]): Source[] => {
  if (years.length === 0) return []
  const oldest = Math.min(...years)
  return sources.filter((s) => s.to >= oldest - 1)
}
