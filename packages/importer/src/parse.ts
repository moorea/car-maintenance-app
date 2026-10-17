/**
 * Reading NHTSA's bulk files: tab-separated text, one record per line, dates as YYYYMMDD. The
 * layouts are at https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS.txt (manufacturer communications)
 * and https://static.nhtsa.gov/odi/ffdd/cmpl/CMPL.txt (complaints).
 */

/** A model year as the database matches it: make and model lower-cased. */
export interface ModelYear {
  make: string
  model: string
  year: number
}

export const modelYearKey = (m: ModelYear): string => `${m.make}|${m.model}|${m.year}`

const keyOf = (make: string, model: string, year: string) =>
  `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}|${Number(year.trim())}`

export type BulletinKind = 'bulletin' | 'warranty' | 'campaign' | 'software' | 'emissions' | 'other'

/** One manufacturer communication for one model year, as `nhtsa_store_bulletins` takes it. */
export interface BulletinRow {
  nhtsa_id: number
  document_id: string | null
  kind: BulletinKind
  issued_on: string | null
  components: string[]
  system: string | null
  summary: string
}

/** One complaint's mileage, as `nhtsa_store_complaint_miles` takes it. */
export interface MilesRow {
  odi_number: number
  miles: number
}

/** "20190501" as "2019-05-01"; anything that is not a real date is null. */
export const isoDate = (value: string | undefined): string | null => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value?.trim() ?? '')
  if (!m) return null
  const [, y, mo, d] = m.map(Number) as [number, number, number, number]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && y >= 1950
    ? `${m[1]}-${m[2]}-${m[3]}`
    : null
}

/**
 * The kind of communication, from NHTSA's "Communication Type": service bulletins and repair
 * instructions, service campaigns, warranty programs and extensions, over-the-air updates,
 * emissions, or other. Matched by words, since the exact labels have changed over the years.
 */
export const bulletinKind = (type: string): BulletinKind => {
  const t = type.toUpperCase()
  if (/WARRANTY|COVERAGE/.test(t)) return 'warranty'
  if (/CAMPAIGN|RECALL/.test(t)) return 'campaign'
  if (/OVER.?THE.?AIR|\bOTA\b|SOFTWARE/.test(t)) return 'software'
  if (/EMISSION/.test(t)) return 'emissions'
  if (/BULLETIN|REPAIR|TSB|SERVICE/.test(t)) return 'bulletin'
  return 'other'
}

const text = (value: string | undefined) => {
  const t = value?.trim() ?? ''
  return t === '' ? null : t
}

/** The top-level component, before any colon: "POWER TRAIN:AUTOMATIC" is "POWER TRAIN". */
const topLevel = (component: string) => component.split(':')[0]?.trim().toUpperCase() ?? ''

// Manufacturer communications: 14 tab-separated fields.
const TSB = {
  id: 0,
  added: 2,
  document: 3,
  communicated: 4,
  type: 6,
  make: 7,
  model: 8,
  year: 9,
  component: 10,
  system: 11,
  subsystem: 12,
  summary: 13,
} as const
const TSB_FIELDS = 14

/**
 * Collects manufacturer communications for the wanted model years. The flat file has one line
 * per product and component, so a communication about several components spans several lines;
 * they are merged into one row per model year.
 */
export const bulletinCollector = (wanted: Set<string>) => {
  const byModelYear = new Map<string, Map<number, BulletinRow>>()
  const stats = { lines: 0, kept: 0, malformed: 0 }
  return {
    stats,
    add: (line: string) => {
      stats.lines++
      const f = line.split('\t')
      if (f.length < TSB_FIELDS) {
        if (line.trim() !== '') stats.malformed++
        return
      }
      const key = keyOf(f[TSB.make] ?? '', f[TSB.model] ?? '', f[TSB.year] ?? '')
      if (!wanted.has(key)) return
      const id = Number(f[TSB.id]?.trim())
      if (!Number.isSafeInteger(id) || id <= 0) {
        stats.malformed++
        return
      }
      stats.kept++
      const rows = byModelYear.get(key) ?? new Map<number, BulletinRow>()
      byModelYear.set(key, rows)
      const component = topLevel(f[TSB.component] ?? '')
      const summary = (f.slice(TSB.summary).join(' ') ?? '').trim()
      const existing = rows.get(id)
      if (existing) {
        if (component && !existing.components.includes(component))
          existing.components.push(component)
        if (summary.length > existing.summary.length) existing.summary = summary
        return
      }
      const system = [text(f[TSB.system]), text(f[TSB.subsystem])].filter(Boolean).join(' / ')
      rows.set(id, {
        nhtsa_id: id,
        document_id: text(f[TSB.document]),
        kind: bulletinKind(f[TSB.type] ?? ''),
        issued_on: isoDate(f[TSB.communicated]) ?? isoDate(f[TSB.added]),
        components: component ? [component] : [],
        system: system === '' ? null : system,
        summary,
      })
    },
    /** The rows of one model year, sorted by NHTSA id; empty when the files list none. */
    rowsFor: (modelYear: ModelYear): BulletinRow[] =>
      [...(byModelYear.get(modelYearKey(modelYear))?.values() ?? [])]
        .map((r) => ({ ...r, components: [...r.components].sort() }))
        .sort((a, b) => a.nhtsa_id - b.nhtsa_id),
  }
}

// Complaints: 51 tab-separated fields, of which these are needed.
const CMPL = { odi: 1, make: 3, model: 4, year: 5, miles: 17 } as const
const CMPL_MIN_FIELDS = 18
/** Mileages above this are typos, not odometers. */
export const MAX_PLAUSIBLE_MILES = 999_999

/** Collects the mileage of each complaint about the wanted model years. */
export const milesCollector = (wanted: Set<string>) => {
  const miles = new Map<number, number>()
  const stats = { lines: 0, kept: 0, malformed: 0 }
  return {
    stats,
    add: (line: string) => {
      stats.lines++
      const f = line.split('\t')
      if (f.length < CMPL_MIN_FIELDS) {
        if (line.trim() !== '') stats.malformed++
        return
      }
      if (!wanted.has(keyOf(f[CMPL.make] ?? '', f[CMPL.model] ?? '', f[CMPL.year] ?? ''))) return
      const odi = Number(f[CMPL.odi]?.trim())
      const value = Number(f[CMPL.miles]?.trim())
      if (!Number.isSafeInteger(odi) || odi <= 0) {
        stats.malformed++
        return
      }
      if (!Number.isInteger(value) || value <= 0 || value > MAX_PLAUSIBLE_MILES) return
      stats.kept++
      miles.set(odi, value)
    },
    rows: (): MilesRow[] =>
      [...miles]
        .map(([odi_number, m]) => ({ odi_number, miles: m }))
        .sort((a, b) => a.odi_number - b.odi_number),
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

// Windows-1252's characters for bytes 0x80 to 0x9F, where it differs from Latin-1 (Node's
// TextDecoder decodes "windows-1252" as Latin-1). Undefined bytes stay as they are.
const CP1252 =
  '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f' +
  '\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178'

const windows1252 = (bytes: Uint8Array) => {
  let out = ''
  for (const b of bytes) out += b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b)
  return out
}

/** A line's text: UTF-8 when it is valid UTF-8, otherwise Windows-1252, which older files use. */
export const decodeLine = (bytes: Uint8Array): string => {
  try {
    return utf8.decode(bytes)
  } catch {
    return windows1252(bytes)
  }
}

/** Splits a byte stream into decoded lines, without the line ending. */
export async function* lines(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  let pending = new Uint8Array(0)
  for await (const chunk of chunks) {
    const data = new Uint8Array(pending.length + chunk.length)
    data.set(pending)
    data.set(chunk, pending.length)
    let start = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0x0a) continue
      const end = i > start && data[i - 1] === 0x0d ? i - 1 : i
      yield decodeLine(data.subarray(start, end))
      start = i + 1
    }
    pending = data.slice(start)
  }
  if (pending.length > 0) yield decodeLine(pending)
}
