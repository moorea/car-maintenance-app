import { describe, expect, it } from 'vitest'
import {
  bulletinCollector,
  bulletinKind,
  decodeLine,
  isoDate,
  lines,
  milesCollector,
  modelYearKey,
} from './parse.ts'

const CRV = { make: 'honda', model: 'cr-v', year: 2017 }
const wanted = new Set([modelYearKey(CRV)])

/** A manufacturer communications line, in the flat file's 14-field layout. */
const tsb = (fields: Partial<Record<string, string>> = {}) =>
  [
    fields.id ?? '10181234',
    '',
    fields.added ?? '20190520',
    fields.document ?? '19-047',
    fields.communicated ?? '20190501',
    fields.campaign ?? '',
    fields.type ?? 'WARRANTY PROGRAM/EXTENSION',
    fields.make ?? 'HONDA',
    fields.model ?? 'CR-V',
    fields.year ?? '2017',
    fields.component ?? 'ENGINE:OIL',
    fields.system ?? 'Engine',
    fields.subsystem ?? 'Lubrication',
    fields.summary ?? 'OIL MAY DILUTE WITH FUEL. COVERAGE EXTENDED.',
  ].join('\t')

/** A complaint line, in the flat file's layout up to MILES (field 18). */
const complaint = (odi: string, miles: string, model = 'CR-V') =>
  [
    '1',
    odi,
    'Honda',
    'HONDA',
    model,
    '2017',
    'N',
    '20240101',
    'N',
    '0',
    '0',
    'ENGINE',
    'X',
    'CA',
    '5J6RW1H5',
    '20240102',
    '20240102',
    miles,
    '1',
    'Oil rising.',
  ].join('\t')

describe('isoDate', () => {
  it('reads YYYYMMDD', () => expect(isoDate('20190501')).toBe('2019-05-01'))
  it('rejects what is not a real date', () => {
    expect(isoDate('20190231')).toBeNull()
    expect(isoDate('')).toBeNull()
    expect(isoDate('00000000')).toBeNull()
    expect(isoDate(undefined)).toBeNull()
  })
})

describe('bulletinKind', () => {
  it.each([
    ['SERVICE BULLETIN/REPAIR INSTRUCTIONS', 'bulletin'],
    ['TSB', 'bulletin'],
    ['WARRANTY PROGRAM/EXTENSION', 'warranty'],
    ['SPECIAL COVERAGE', 'warranty'],
    ['SERVICE CAMPAIGN', 'campaign'],
    ['OVER-THE-AIR UPDATE', 'software'],
    ['EMISSIONS', 'emissions'],
    ['OTHER', 'other'],
    ['', 'other'],
  ])('reads "%s" as %s', (type, kind) => expect(bulletinKind(type)).toBe(kind))
})

describe('bulletinCollector', () => {
  it('keeps the wanted model years, matching make and model in any case', () => {
    const c = bulletinCollector(wanted)
    c.add(tsb())
    c.add(tsb({ id: '2', model: 'Civic' }))
    c.add(tsb({ id: '3', year: '2018' }))
    c.add(tsb({ id: '4', make: 'honda', model: 'cr-v' }))
    expect(c.rowsFor(CRV).map((r) => r.nhtsa_id)).toEqual([4, 10181234])
    expect(c.stats).toEqual({ lines: 4, kept: 2, malformed: 0 })
  })

  it('reads a communication into a bulletin row', () => {
    const c = bulletinCollector(wanted)
    c.add(tsb())
    expect(c.rowsFor(CRV)).toEqual([
      {
        nhtsa_id: 10181234,
        document_id: '19-047',
        kind: 'warranty',
        issued_on: '2019-05-01',
        components: ['ENGINE'],
        system: 'Engine / Lubrication',
        summary: 'OIL MAY DILUTE WITH FUEL. COVERAGE EXTENDED.',
      },
    ])
  })

  it('merges the lines of one communication about several components', () => {
    const c = bulletinCollector(wanted)
    c.add(tsb({ component: 'POWER TRAIN:AUTOMATIC', summary: 'Short.' }))
    c.add(tsb({ component: 'ENGINE', summary: 'The longer summary.' }))
    c.add(tsb({ component: 'ENGINE:OIL' }))
    const [row] = c.rowsFor(CRV)
    expect(row?.components).toEqual(['ENGINE', 'POWER TRAIN'])
    expect(row?.summary).toBe('OIL MAY DILUTE WITH FUEL. COVERAGE EXTENDED.')
  })

  it('falls back to the date NHTSA added it, and leaves out what is blank', () => {
    const c = bulletinCollector(wanted)
    c.add(tsb({ communicated: '', document: ' ', system: '', subsystem: '', component: '' }))
    expect(c.rowsFor(CRV)[0]).toMatchObject({
      issued_on: '2019-05-20',
      document_id: null,
      system: null,
      components: [],
    })
  })

  it('counts lines it cannot read, ignoring blank ones', () => {
    const c = bulletinCollector(wanted)
    c.add('not\ttab\tseparated')
    c.add('')
    c.add(tsb({ id: 'abc' }))
    expect(c.stats).toMatchObject({ lines: 3, malformed: 2 })
    expect(c.rowsFor(CRV)).toEqual([])
  })

  it('keeps a summary that contains a tab', () => {
    const c = bulletinCollector(wanted)
    c.add(`${tsb({ summary: 'First part' })}\tsecond part`)
    expect(c.rowsFor(CRV)[0]?.summary).toBe('First part second part')
  })
})

describe('milesCollector', () => {
  it('keeps the mileage of complaints about the wanted model years', () => {
    const c = milesCollector(wanted)
    c.add(complaint('11000002', '88000'))
    c.add(complaint('11000001', '1200'))
    c.add(complaint('11000003', '50000', 'CIVIC'))
    expect(c.rows()).toEqual([
      { odi_number: 11000001, miles: 1200 },
      { odi_number: 11000002, miles: 88000 },
    ])
  })

  it('leaves out unknown, zero and impossible mileages', () => {
    const c = milesCollector(wanted)
    c.add(complaint('1', ''))
    c.add(complaint('2', '0'))
    c.add(complaint('3', '5000000'))
    c.add(complaint('4', '12.5'))
    expect(c.rows()).toEqual([])
    expect(c.stats.malformed).toBe(0)
  })

  it('counts lines it cannot read', () => {
    const c = milesCollector(wanted)
    c.add('short\tline')
    c.add(complaint('x', '100'))
    expect(c.stats).toMatchObject({ lines: 2, malformed: 2 })
  })
})

describe('reading lines', () => {
  const bytes = (...parts: (string | number[])[]) =>
    parts.map((p) => (typeof p === 'string' ? new TextEncoder().encode(p) : new Uint8Array(p)))

  async function* stream(chunks: Uint8Array[]) {
    for (const c of chunks) yield c
  }

  const collect = async (chunks: Uint8Array[]) => {
    const out: string[] = []
    for await (const line of lines(stream(chunks))) out.push(line)
    return out
  }

  it('splits lines across chunks and drops CRLF endings', async () => {
    expect(await collect(bytes('a\tb\r\nc', 'd\n', 'e'))).toEqual(['a\tb', 'cd', 'e'])
  })

  it('reads UTF-8, and Windows-1252 where a line is not valid UTF-8', async () => {
    expect(decodeLine(new TextEncoder().encode('Café'))).toBe('Café')
    expect(decodeLine(new Uint8Array([0x93, 0x4f, 0x4b, 0x94]))).toBe('“OK”')
  })
})
