import { describe, expect, it } from 'vitest'
import type { Complaint, MaintenanceItem, Vehicle } from '../domain/types'
import { groundingDocuments, MAX_COMPLAINTS, type CarFacts } from './grounding'

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

  it('points recalls at the VIN lookup, since a model-year recall may not apply', () => {
    const recall = groundingDocuments(facts())[3]
    expect(recall?.text).toContain('https://www.nhtsa.gov/recalls?vin=2T3P1RFV0MW000000')
  })

  it('keeps only the newest raw complaints', () => {
    const many = Array.from({ length: MAX_COMPLAINTS + 5 }, (_, i) => complaint(i + 1))
    const docs = groundingDocuments(facts({ complaints: many }))
    expect(docs.filter((d) => d.source.kind === 'complaint')).toHaveLength(MAX_COMPLAINTS)
  })
})
