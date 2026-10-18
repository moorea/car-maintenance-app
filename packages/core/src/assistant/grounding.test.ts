import { describe, expect, it } from 'vitest'
import type { Bulletin, Complaint, MaintenanceItem, Vehicle } from '../domain/types'
import {
  ASSISTANT_SYSTEM_PROMPT,
  complaintSample,
  groundingDocuments,
  MAX_BULLETINS,
  MAX_COMPLAINTS,
  MAX_NEARBY_COMPLAINTS,
  type CarFacts,
} from './grounding'

const vehicle: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  trim: 'XLE',
  nickname: 'Rav',
  severeDuty: false,
  vin: '2T3P1RFV0MW000000',
}

const oil: MaintenanceItem = {
  id: 'oil',
  configId: 'c1',
  task: 'Oil & filter change',
  intervalMiles: 10_000,
  intervalMonths: 12,
  severeMiles: 5_000,
}

const complaint = (n: number): Complaint => ({
  odiNumber: n,
  components: ['ENGINE'],
  summary: `Complaint number ${n}`,
  filedOn: '2026-01-01',
  crash: false,
  fire: false,
  injuries: 0,
  deaths: 0,
})

const facts = (overrides: Partial<CarFacts> = {}): CarFacts => ({
  vehicle,
  today: '2026-10-17',
  readings: [
    { vehicleId: 'v1', date: '2026-04-01', miles: 24_000 },
    { vehicleId: 'v1', date: '2026-10-01', miles: 30_000 },
  ],
  schedule: [oil],
  records: [
    {
      id: 'r1',
      vehicleId: 'v1',
      itemId: 'oil',
      performedOn: '2026-07-01',
      odometerMiles: 28_000,
      costCents: 8_995,
      shop: 'Main St Garage',
    },
  ],
  safety: {
    recallsCheckedAt: '2026-10-16T12:00:00Z',
    complaintsCheckedAt: '2026-10-16T12:00:00Z',
    recalls: [
      {
        id: 'rc1',
        configId: 'c1',
        campaign: '24V001000',
        component: 'FUEL SYSTEM, GASOLINE',
        summary: 'The fuel pump may fail.',
        remedy: 'Dealers will replace the pump.',
        parkIt: false,
        parkOutside: false,
        overTheAir: false,
      },
    ],
    complaints: [
      {
        id: 'cs1',
        configId: 'c1',
        component: 'SERVICE BRAKES',
        complaints: 12,
        crashes: 1,
        fires: 0,
        injuries: 0,
        deaths: 0,
        recent: [{ filedOn: '2026-02-01', summary: 'Brakes squeal.' }],
      },
    ],
  },
  complaints: [complaint(1)],
  ...overrides,
})

describe('groundingDocuments', () => {
  it('starts with the car, then every stored fact as its own citable document', () => {
    const docs = groundingDocuments(facts())
    expect(docs.map((d) => d.source)).toEqual([
      { kind: 'car', id: 'v1', label: 'Your car' },
      { kind: 'schedule', id: 'oil', label: 'Schedule: Oil & filter change' },
      { kind: 'service', id: 'r1', label: 'Service log, 2026-07-01' },
      { kind: 'recall', id: '24V001000', label: 'Recall 24V001000' },
      { kind: 'complaints', id: 'SERVICE BRAKES', label: 'Complaints: Service brakes' },
      { kind: 'complaint', id: '1', label: 'Complaint 1' },
    ])
  })

  it('describes the car with its mileage and what NHTSA has been asked', () => {
    const [car] = groundingDocuments(facts())
    expect(car?.text).toContain("The owner's car: 2021 Toyota RAV4 XLE.")
    expect(car?.text).toContain('Last odometer reading: 30,000 mi on 2026-10-01.')
    expect(car?.text).toContain(
      'Estimated odometer today: about 30,390 mi, projected from its readings',
    )
    expect(car?.text).toContain('NHTSA lists 1 recall for this model year')
  })

  it('tells the model what the owner said the car is worth, so it can weigh a repair', () => {
    const valued = { ...facts().vehicle, valueCents: 950_000, valuedOn: '2026-09-01' }
    expect(groundingDocuments(facts({ vehicle: valued }))[0]?.text).toContain(
      'The owner said on 2026-09-01 that the car is worth about $9,500.00.',
    )
    expect(groundingDocuments(facts())[0]?.text).not.toContain('worth')
  })

  it('says when nothing is known yet, so the model does not fill the gap', () => {
    const [car] = groundingDocuments(
      facts({ schedule: [], readings: [], safety: { recalls: [], complaints: [] } }),
    )
    expect(car?.text).toContain('No maintenance schedule is stored for this car yet.')
    expect(car?.text).toContain('No odometer reading is stored.')
    expect(car?.text).toContain('NHTSA has not been asked about recalls')
  })

  it('gives each schedule item its intervals, last service and next due point', () => {
    const schedule = groundingDocuments(facts())[1]
    expect(schedule?.text).toBe(
      [
        'Oil & filter change: every 10,000 mi or 12 months, whichever comes first under normal conditions.',
        'Severe conditions: every 5,000 mi or 12 months, whichever comes first.',
        "Last done on 2026-07-01 at 28,000 mi, according to the owner's service log.",
        'Next due around 2027-07-01 at 38,000 mi: not due yet.',
      ].join('\n'),
    )
  })

  it("says a baseline schedule item is general guidance, not the manufacturer's", () => {
    const schedule = groundingDocuments(facts({ schedule: [{ ...oil, source: 'baseline' }] }))[1]
    expect(schedule?.text.split('\n')[1]).toBe(
      "This is the app's general guidance for most cars, not Toyota's own schedule for this car, which the owner's manual has.",
    )
  })

  it('tells the model to say so when it quotes general guidance', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain(
      "when you quote one, say it is general guidance and that the owner's manual has the exact interval",
    )
  })

  it('points recalls at the VIN lookup, since a model-year recall may not apply', () => {
    const recall = groundingDocuments(facts())[3]
    expect(recall?.text).toContain('https://www.nhtsa.gov/recalls?vin=2T3P1RFV0MW000000')
  })

  it('keeps only the newest raw complaints', () => {
    const many = Array.from({ length: MAX_COMPLAINTS + 5 }, (_, i) => complaint(i + 1))
    const docs = groundingDocuments(facts({ complaints: many }))
    expect(docs.filter((d) => d.source.kind === 'complaint')).toHaveLength(MAX_COMPLAINTS)
  })

  const bulletin = (nhtsaId: number, extra: Partial<Bulletin> = {}): Bulletin => ({
    id: `b${nhtsaId}`,
    configId: 'c1',
    nhtsaId,
    documentId: `T-SB-${nhtsaId}`,
    kind: 'bulletin',
    issuedOn: '2024-03-01',
    components: ['POWER TRAIN'],
    summary: 'SOME VEHICLES MAY HESITATE. UPDATE THE ECM SOFTWARE.',
    ...extra,
  })

  const withBulletins = (bulletins: Bulletin[]) =>
    facts({
      safety: { ...facts().safety, bulletinsCheckedAt: '2026-10-16T12:00:00Z', bulletins },
    })

  it('gives each bulletin its number, kind and a readable summary', () => {
    const doc = groundingDocuments(withBulletins([bulletin(7)])).find(
      (d) => d.source.kind === 'bulletin',
    )
    expect(doc?.source).toEqual({ kind: 'bulletin', id: '7', label: 'Service bulletin T-SB-7' })
    expect(doc?.text).toContain('issued 2024-03-01')
    expect(doc?.text).toContain('Summary: Some vehicles may hesitate. Update the ECM software.')
    expect(doc?.text).toContain('it is not a recall')
  })

  it('says a warranty extension may make the repair free', () => {
    const doc = groundingDocuments(withBulletins([bulletin(7, { kind: 'warranty' })])).find(
      (d) => d.source.kind === 'bulletin',
    )
    expect(doc?.text).toContain('A warranty extension can make this repair free')
  })

  it('keeps warranty extensions when there are too many bulletins to send', () => {
    const many = Array.from({ length: MAX_BULLETINS + 10 }, (_, i) => bulletin(i + 1))
    const extension = bulletin(999, { kind: 'warranty', issuedOn: '2010-01-01' })
    const docs = groundingDocuments(withBulletins([...many, extension]))
    const sent = docs.filter((d) => d.source.kind === 'bulletin')
    expect(sent).toHaveLength(MAX_BULLETINS)
    expect(sent[0]?.source.id).toBe('999')
    expect(docs[0]?.text).toContain('the 40 most important are included here')
  })

  it('says when bulletins have not been imported yet', () => {
    expect(groundingDocuments(facts())[0]?.text).toContain(
      "The manufacturer's service bulletins for this model year have not been imported yet.",
    )
  })

  it("tells the model what owners reported around the car's mileage", () => {
    const base = facts()
    const docs = groundingDocuments(
      facts({
        safety: {
          ...base.safety,
          complaints: base.safety.complaints.map((c) => ({
            ...c,
            byMileage: [
              { from: 30_000, complaints: 5 },
              { from: 70_000, complaints: 2 },
            ],
          })),
        },
      }),
    )
    expect(docs[0]?.text).toContain(
      "Between 30,000–50,000 mi, around this car's mileage, owners of this model year most often reported: SERVICE BRAKES (5 complaints).",
    )
    expect(docs.find((d) => d.source.kind === 'complaints')?.text).toContain(
      'By the mileage owners gave: 5 at 30,000–40,000 mi, 2 at 70,000–80,000 mi.',
    )
  })

  it('says the mileage a complaint happened at', () => {
    const docs = groundingDocuments(facts({ complaints: [{ ...complaint(1), miles: 31_000 }] }))
    expect(docs.find((d) => d.source.kind === 'complaint')?.text).toContain(
      'It happened at 31,000 mi, the owner says.',
    )
  })

  it('tells the model bulletins are not recalls and to name their number', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('Service bulletins are the manufacturer')
  })
})

describe('complaintSample', () => {
  const at = (n: number, miles: number | undefined, filedOn = '2026-01-01'): Complaint => ({
    ...complaint(n),
    filedOn,
    ...(miles !== undefined ? { miles } : {}),
  })

  it("keeps the complaints nearest the car's mileage as well as the newest", () => {
    const newest = Array.from({ length: MAX_COMPLAINTS }, (_, i) =>
      at(100 + i, undefined, '2026-06-01'),
    )
    const near = at(1, 88_500, '2015-01-01')
    const far = at(2, 20_000, '2015-01-01')
    const sample = complaintSample([...newest, near, far], 88_000)
    expect(sample).toHaveLength(MAX_COMPLAINTS)
    expect(sample.map((c) => c.odiNumber)).toContain(1)
    expect(sample.map((c) => c.odiNumber)).not.toContain(2)
  })

  it('caps the nearby ones so the newest still get in', () => {
    const near = Array.from({ length: MAX_COMPLAINTS }, (_, i) => at(i + 1, 88_000, '2015-01-01'))
    const newest = Array.from({ length: MAX_COMPLAINTS }, (_, i) =>
      at(100 + i, undefined, '2026-06-01'),
    )
    const sample = complaintSample([...near, ...newest], 88_000)
    expect(sample.filter((c) => c.miles !== undefined)).toHaveLength(MAX_NEARBY_COMPLAINTS)
  })

  it('is the newest alone when the mileage is unknown', () => {
    const sample = complaintSample(
      [at(1, 88_000, '2015-01-01'), at(2, undefined, '2026-01-01')],
      undefined,
    )
    expect(sample.map((c) => c.odiNumber)).toEqual([2, 1])
  })
})
