import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Attachment, Vehicle } from '../domain/types'
import { buildArchive, ImportError, readArchive, type CarData } from './archive'
import { csv } from './csv'
import { NOTES_MAX, SHORT_TEXT_MAX } from '../schemas/text'

/** The value, failing the test when there is none. */
const got = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Expected a value')
  return value
}

const RAV4: Vehicle = {
  id: 'car-1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  trim: 'XLE',
  vin: '2T3P1RFV8MW123456',
  nickname: 'Blue "Bessie"',
  severeDuty: true,
  valueCents: 1_850_000,
  valuedOn: '2026-09-01',
}

const receipt: Attachment = {
  id: 'att-1',
  vehicleId: 'car-1',
  serviceRecordId: 'svc-1',
  kind: 'receipt',
  name: 'Oil change',
  contentType: 'image/jpeg',
  sizeBytes: 3,
  addedOn: '2026-03-01',
}
const card: Attachment = {
  id: 'att-2',
  vehicleId: 'car-1',
  kind: 'insurance',
  name: 'Card.pdf',
  contentType: 'application/pdf',
  sizeBytes: 4,
  addedOn: '2026-01-05',
}

const rav4: CarData = {
  vehicle: RAV4,
  readings: [
    { vehicleId: 'car-1', date: '2026-03-01', miles: 30_500 },
    { vehicleId: 'car-1', date: '2025-01-01', miles: 20_000 },
  ],
  services: [
    {
      id: 'svc-1',
      vehicleId: 'car-1',
      itemId: 'item-oil',
      performedOn: '2026-03-01',
      odometerMiles: 30_500,
      costCents: 8995,
      shop: 'Main St, Auto',
      notes: 'Synthetic\nnext at 35k',
    },
  ],
  attachments: [receipt, card],
  warranties: [
    {
      id: 'w-1',
      vehicleId: 'car-1',
      kind: 'powertrain',
      provider: 'Toyota',
      startsOn: '2021-06-01',
      months: 60,
      endMiles: 60_000,
    },
  ],
  fillUps: [
    {
      id: 'f-2',
      vehicleId: 'car-1',
      filledOn: '2026-02-20',
      odometerMiles: 30_100,
      energy: 'fuel',
      quantity: 11.204,
      full: false,
      missedPrevious: true,
      notes: 'Forgot the receipt',
    },
    {
      id: 'f-1',
      vehicleId: 'car-1',
      filledOn: '2026-02-01',
      odometerMiles: 29_800,
      energy: 'fuel',
      quantity: 12.5,
      costCents: 4250,
      full: true,
      missedPrevious: false,
      station: 'Costco',
    },
  ],
  tireSets: [
    {
      id: 't-2',
      vehicleId: 'car-1',
      name: 'Winter',
      madeWeek: 40,
      madeYear: 2022,
      mounted: false,
      priorMiles: 8_000,
    },
    {
      id: 't-1',
      vehicleId: 'car-1',
      name: 'All-season',
      brand: 'Michelin CrossClimate 2',
      size: '225/65R17',
      madeWeek: 14,
      madeYear: 2024,
      mounted: true,
      mountedAtMiles: 29_000,
      priorMiles: 0,
      treadDepth32nds: 8,
      treadCheckedOn: '2026-03-01',
    },
  ],
  renewals: [
    {
      id: 'r-2',
      vehicleId: 'car-1',
      kind: 'other',
      title: 'Parking permit',
      dueOn: '2027-01-01',
    },
    {
      id: 'r-1',
      vehicleId: 'car-1',
      kind: 'registration',
      dueOn: '2026-11-30',
      everyMonths: 12,
      notes: 'Plate 8ABC123',
    },
  ],
  items: [{ id: 'item-oil', configId: 'cfg', task: 'Engine oil and filter', kind: 'engine-oil' }],
}

const files = new Map([
  ['att-1', new Uint8Array([1, 2, 3])],
  ['att-2', new Uint8Array([4, 5, 6, 7])],
])

const entries = (bytes: Uint8Array) => unzipSync(bytes)
/** A file's text. fflate's decoding drops the byte order mark the CSV files start with. */
const withoutBom = (rows: string[][]) => csv(rows).slice(1)
const textOf = (bytes: Uint8Array, path: string) => strFromU8(got(entries(bytes)[path]))

describe('buildArchive', () => {
  it('holds the data as JSON, the same data as CSV, a readme and every file', () => {
    const { bytes, missing } = buildArchive([rav4], files, '2026-10-17')

    expect(Object.keys(entries(bytes)).sort()).toEqual([
      'README.txt',
      'car-data.json',
      'cars.csv',
      'documents.csv',
      'documents/Blue -Bessie-/Card.pdf',
      'documents/Blue -Bessie-/Oil change.jpg',
      'fill-ups.csv',
      'odometer.csv',
      'renewals.csv',
      'service-log.csv',
      'tires.csv',
      'warranties.csv',
    ])
    expect(missing).toEqual([])
    expect(entries(bytes)['documents/Blue -Bessie-/Oil change.jpg']).toEqual(
      new Uint8Array([1, 2, 3]),
    )
  })

  it('writes CSV a spreadsheet opens: quoted where needed, dollars, oldest first', () => {
    const { bytes } = buildArchive([rav4], files, '2026-10-17')

    expect([...got(entries(bytes)['service-log.csv']).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(textOf(bytes, 'service-log.csv')).toBe(
      withoutBom([
        ['car', 'date', 'service', 'odometer_miles', 'cost_usd', 'shop', 'notes', 'files'],
        [
          'Blue -Bessie-',
          '2026-03-01',
          'Engine oil and filter',
          '30500',
          '89.95',
          'Main St, Auto',
          'Synthetic\nnext at 35k',
          'documents/Blue -Bessie-/Oil change.jpg',
        ],
      ]),
    )
    expect(textOf(bytes, 'service-log.csv')).toContain('"Main St, Auto","Synthetic\nnext at 35k"')
    expect(textOf(bytes, 'odometer.csv').split('\r\n').slice(1, 3)).toEqual([
      'Blue -Bessie-,2025-01-01,20000',
      'Blue -Bessie-,2026-03-01,30500',
    ])
    expect(textOf(bytes, 'cars.csv')).toContain(
      'Blue -Bessie-,2021,Toyota,RAV4,XLE,,,2T3P1RFV8MW123456,"Blue ""Bessie""",yes,18500.00,2026-09-01',
    )
    expect(textOf(bytes, 'warranties.csv')).toContain(
      'Blue -Bessie-,powertrain,Toyota,2021-06-01,60,60000,,',
    )
    expect(textOf(bytes, 'fill-ups.csv').split('\r\n').slice(1, 3)).toEqual([
      'Blue -Bessie-,2026-02-01,29800,fuel,12.5,gal,42.50,yes,no,Costco,',
      'Blue -Bessie-,2026-02-20,30100,fuel,11.204,gal,,no,yes,,Forgot the receipt',
    ])
    expect(textOf(bytes, 'renewals.csv').split('\r\n').slice(1, 3)).toEqual([
      'Blue -Bessie-,registration,,2026-11-30,12,Plate 8ABC123',
      'Blue -Bessie-,other,Parking permit,2027-01-01,,',
    ])
  })

  it('names each service by its schedule item in the JSON, so it means something elsewhere', () => {
    const { bytes } = buildArchive([rav4], files, '2026-10-17')
    const data = JSON.parse(textOf(bytes, 'car-data.json'))

    expect(data).toMatchObject({ format: 'car-maintenance-export', version: 1 })
    expect(data.cars[0].services[0]).toEqual({
      id: 'svc-1',
      itemId: 'item-oil',
      itemKind: 'engine-oil',
      task: 'Engine oil and filter',
      performedOn: '2026-03-01',
      odometerMiles: 30500,
      costCents: 8995,
      shop: 'Main St, Auto',
      notes: 'Synthetic\nnext at 35k',
    })
  })

  it('lists a document whose file is not available without the file', () => {
    const { bytes, missing } = buildArchive(
      [rav4],
      new Map([['att-2', got(files.get('att-2'))]]),
      'd',
    )

    expect(missing).toEqual([receipt])
    const data = JSON.parse(textOf(bytes, 'car-data.json'))
    expect(data.cars[0].documents.find((d: { id: string }) => d.id === 'att-1').file).toBeNull()
  })

  it('gives cars and files with the same name their own folders and names', () => {
    const twin: CarData = {
      ...rav4,
      vehicle: { ...RAV4, id: 'car-2', vin: '2T3P1RFV8MW654321' },
      attachments: [
        { ...card, id: 'att-3', vehicleId: 'car-2' },
        { ...card, id: 'att-4', vehicleId: 'car-2' },
      ],
    }
    const all = new Map([...files, ['att-3', new Uint8Array([1])], ['att-4', new Uint8Array([2])]])

    const names = Object.keys(entries(buildArchive([rav4, twin], all, 'd').bytes))

    expect(names).toContain('documents/Blue -Bessie- (2)/Card.pdf')
    expect(names).toContain('documents/Blue -Bessie- (2)/Card (2).pdf')
  })

  it('keeps a spreadsheet from running a note as a formula', () => {
    const risky: CarData = {
      ...rav4,
      services: [
        { id: 's', vehicleId: 'car-1', performedOn: '2026-01-01', notes: '=1+1', shop: '@shop' },
      ],
    }

    expect(textOf(buildArchive([risky], files, 'd').bytes, 'service-log.csv')).toContain(
      ",'@shop,'=1+1,",
    )
  })

  it('names a car without a nickname by its year, make and model', () => {
    const { bytes } = buildArchive([{ ...rav4, vehicle: { ...RAV4, nickname: '' } }], files, 'd')

    expect(textOf(bytes, 'cars.csv')).toContain('\r\n2021 Toyota RAV4,')
  })
})

describe('readArchive', () => {
  it('reads back what buildArchive wrote, with its files', () => {
    const archive = readArchive(buildArchive([rav4], files, '2026-10-17').bytes)

    expect(archive.data.cars[0]).toMatchObject({
      vin: RAV4.vin,
      nickname: RAV4.nickname,
      valueCents: 1_850_000,
      valuedOn: '2026-09-01',
    })
    expect(archive.data.cars[0]?.fillUps).toEqual([
      expect.objectContaining({ filledOn: '2026-02-01', quantity: 12.5, costCents: 4250 }),
      expect.objectContaining({ filledOn: '2026-02-20', full: false, missedPrevious: true }),
    ])
    expect(archive.file('documents/Blue -Bessie-/Card.pdf')).toEqual(new Uint8Array([4, 5, 6, 7]))
    expect(archive.file('documents/nope.pdf')).toBeUndefined()
  })

  it('lists tire sets in the JSON and the CSV, the set on the car first', () => {
    const { bytes } = buildArchive([rav4], files, '2026-10-17')
    expect(textOf(bytes, 'tires.csv').split('\r\n').slice(1, 3)).toEqual([
      'Blue -Bessie-,All-season,Michelin CrossClimate 2,225/65R17,14,2024,yes,29000,0,8,2026-03-01,',
      'Blue -Bessie-,Winter,,,40,2022,no,,8000,,,',
    ])
    expect(readArchive(bytes).data.cars[0]?.tireSets).toEqual([
      {
        id: 't-1',
        name: 'All-season',
        brand: 'Michelin CrossClimate 2',
        size: '225/65R17',
        madeWeek: 14,
        madeYear: 2024,
        mounted: true,
        mountedAtMiles: 29_000,
        priorMiles: 0,
        treadDepth32nds: 8,
        treadCheckedOn: '2026-03-01',
      },
      {
        id: 't-2',
        name: 'Winter',
        madeWeek: 40,
        madeYear: 2022,
        mounted: false,
        priorMiles: 8_000,
      },
    ])
  })

  it('reads an export made before tire sets existed as a car without them', () => {
    const json = JSON.parse(
      textOf(buildArchive([rav4], files, '2026-10-17').bytes, 'car-data.json'),
    )
    delete json.cars[0].tireSets

    expect(readArchive(zipOf(json)).data.cars[0]?.tireSets).toEqual([])
  })

  it('reads back renewals, soonest first', () => {
    const archive = readArchive(buildArchive([rav4], files, '2026-10-17').bytes)
    expect(archive.data.cars[0]?.renewals).toEqual([
      {
        id: 'r-1',
        kind: 'registration',
        dueOn: '2026-11-30',
        everyMonths: 12,
        notes: 'Plate 8ABC123',
      },
      { id: 'r-2', kind: 'other', title: 'Parking permit', dueOn: '2027-01-01' },
    ])
  })

  it('reads an export made before renewals existed as a car without renewals', () => {
    const json = JSON.parse(
      textOf(buildArchive([{ ...rav4, renewals: [] }], files, '2026-10-17').bytes, 'car-data.json'),
    )
    delete json.cars[0].renewals

    expect(readArchive(zipOf(json)).data.cars[0]?.renewals).toEqual([])
  })

  it('reads an export made before car values existed as a car without a value', () => {
    const json = JSON.parse(
      textOf(buildArchive([rav4], files, '2026-10-17').bytes, 'car-data.json'),
    )
    delete json.cars[0].valueCents
    delete json.cars[0].valuedOn

    const car = readArchive(zipOf(json)).data.cars[0]
    expect(car?.valueCents).toBeUndefined()
    expect(car?.valuedOn).toBeUndefined()
  })

  it('reads an export made before fill-ups existed as a car without fill-ups', () => {
    const json = JSON.parse(
      textOf(buildArchive([{ ...rav4, fillUps: [] }], files, '2026-10-17').bytes, 'car-data.json'),
    )
    delete json.cars[0].fillUps

    expect(readArchive(zipOf(json)).data.cars[0]?.fillUps).toEqual([])
  })

  it('cuts free text past what the server keeps, rather than refuse the export', () => {
    const json = JSON.parse(
      textOf(buildArchive([rav4], files, '2026-10-17').bytes, 'car-data.json'),
    )
    json.cars[0].services[0].notes = 'n'.repeat(NOTES_MAX + 5)
    json.cars[0].services[0].shop = 's'.repeat(SHORT_TEXT_MAX + 5)

    const [service] = readArchive(zipOf(json)).data.cars[0]?.services ?? []
    expect(service?.notes).toHaveLength(NOTES_MAX)
    expect(service?.shop).toHaveLength(SHORT_TEXT_MAX)
  })

  it('never cuts an emoji in half when cutting text to fit', () => {
    const json = JSON.parse(
      textOf(buildArchive([rav4], files, '2026-10-17').bytes, 'car-data.json'),
    )
    json.cars[0].services[0].shop = '🚗'.repeat(SHORT_TEXT_MAX + 1)

    const [service] = readArchive(zipOf(json)).data.cars[0]?.services ?? []
    expect(service?.shop).toBe('🚗'.repeat(SHORT_TEXT_MAX))
  })

  const kindOf = (bytes: Uint8Array) => {
    try {
      readArchive(bytes)
    } catch (e) {
      return e instanceof ImportError ? e.kind : 'other'
    }
    return 'none'
  }
  const zipOf = (json: unknown) =>
    zipSync({ 'car-data.json': strToU8(typeof json === 'string' ? json : JSON.stringify(json)) })

  it('refuses a file that is not a zip, or a zip that is not an export', () => {
    expect(kindOf(strToU8('hello'))).toBe('not-an-export')
    expect(kindOf(zipSync({ 'other.txt': strToU8('hi') }))).toBe('not-an-export')
    expect(kindOf(zipOf({ format: 'someone-else', version: 1 }))).toBe('not-an-export')
  })

  it('asks for an update to read an export from a newer version', () => {
    expect(kindOf(zipOf({ format: 'car-maintenance-export', version: 2, cars: 'new' }))).toBe(
      'newer-version',
    )
  })

  it('refuses an export whose data is broken', () => {
    expect(kindOf(zipOf('{not json'))).toBe('damaged')
    expect(
      kindOf(zipOf({ format: 'car-maintenance-export', version: 1, exportedOn: 'x', cars: [] })),
    ).toBe('damaged')
    const data = JSON.parse(
      textOf(buildArchive([rav4], files, '2026-10-17').bytes, 'car-data.json'),
    )
    data.cars[0].warranties[0] = {
      ...data.cars[0].warranties[0],
      months: undefined,
      endMiles: undefined,
    }
    expect(kindOf(zipOf(data))).toBe('damaged')
  })
})
