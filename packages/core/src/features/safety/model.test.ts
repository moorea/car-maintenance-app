import { describe, expect, it } from 'vitest'
import type { Bulletin, ComplaintSummary, OdometerReading, Recall } from '../../domain/types'
import { fixedClock, memoryOdometer, memorySafety, memoryServiceRecords } from '../../testing'
import { createSafetyModel } from './model'

const recall = (campaign: string, extra: Partial<Recall> = {}): Recall => ({
  id: `r-${campaign}`,
  configId: 'c1',
  campaign,
  summary: `Recall ${campaign}`,
  parkIt: false,
  parkOutside: false,
  overTheAir: false,
  ...extra,
})

const complaints = (component: string, count: number): ComplaintSummary => ({
  id: `s-${component}`,
  configId: 'c1',
  component,
  complaints: count,
  crashes: 0,
  fires: 0,
  injuries: 0,
  deaths: 0,
  recent: [],
})

const CHECKED = '2026-10-17 12:00:00Z'

const bulletin = (nhtsaId: number, extra: Partial<Bulletin> = {}): Bulletin => ({
  id: `b-${nhtsaId}`,
  configId: 'c1',
  nhtsaId,
  kind: 'bulletin',
  components: ['ENGINE'],
  summary: `Bulletin ${nhtsaId}.`,
  ...extra,
})

const TODAY = '2026-10-17'

const setup = (
  options: { unmatched?: boolean; vin?: string; readings?: OdometerReading[] } = {},
) => {
  const safety = memorySafety()
  const odometer = memoryOdometer(options.readings ?? [])
  const model = createSafetyModel({
    vehicle: {
      id: 'v1',
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      ...(!options.unmatched && { configId: 'c1' }),
      ...(options.vin !== undefined && { vin: options.vin }),
    },
    safety,
    odometer,
    records: memoryServiceRecords(),
    clock: fixedClock(TODAY),
  })
  return { safety, model, odometer }
}

describe('safety screen model', () => {
  it('stays loading until started', () => {
    expect(setup().model.getState().status).toBe('loading')
  })

  it('says nothing is known for a car not yet matched to a configuration', () => {
    const { model } = setup({ unmatched: true })
    model.getState().start()
    expect(model.getState().status).toBe('unmatched')
  })

  it('shows that NHTSA has not been asked yet, rather than claiming there are no recalls', () => {
    const { model } = setup()
    model.getState().start()
    expect(model.getState()).toMatchObject({ status: 'checking', complaintsChecked: false })
  })

  it('shows recalls once checked: do-not-drive first, then park-outside, then newest', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      recalls: [
        recall('20V001000', { reportedOn: '2020-01-01' }),
        recall('23V002000', { reportedOn: '2023-01-01' }),
        recall('19V003000', { reportedOn: '2019-01-01', parkOutside: true }),
        recall('18V004000', { reportedOn: '2018-01-01', parkIt: true }),
      ],
      complaints: [],
    })
    const s = model.getState()
    expect(s.status).toBe('ready')
    expect(s.recalls.map((r) => r.campaign)).toEqual([
      '18V004000',
      '19V003000',
      '23V002000',
      '20V001000',
    ])
  })

  it('reports no recalls as ready with an empty list, naming the model year it covers', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', { recallsCheckedAt: CHECKED, recalls: [], complaints: [] })
    expect(model.getState()).toMatchObject({
      status: 'ready',
      recalls: [],
      modelYear: '2021 Toyota RAV4',
    })
  })

  it('lists the components with the most complaints first', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      complaintsCheckedAt: CHECKED,
      recalls: [],
      complaints: [complaints('STEERING', 3), complaints('ENGINE', 40), complaints('AIR BAGS', 3)],
    })
    const s = model.getState()
    expect(s.complaintsChecked).toBe(true)
    expect(s.complaints.map((c) => c.component)).toEqual(['ENGINE', 'AIR BAGS', 'STEERING'])
  })

  it('opens and closes items', () => {
    const { model } = setup()
    model.getState().toggle('r-1')
    model.getState().toggle('s-2')
    expect(model.getState().expanded).toEqual(['r-1', 's-2'])
    model.getState().toggle('r-1')
    expect(model.getState().expanded).toEqual(['s-2'])
  })

  it("links to NHTSA's lookup for the car's VIN, where the owner sees what applies and is fixed", () => {
    expect(setup({ vin: '1HGCM82633A004352' }).model.getState().lookupUrl).toBe(
      'https://www.nhtsa.gov/recalls?vin=1HGCM82633A004352',
    )
    expect(setup().model.getState().lookupUrl).toBe('https://www.nhtsa.gov/recalls')
  })

  it('stops following changes once disposed', () => {
    const { model, safety } = setup()
    model.getState().start()
    model.getState().dispose()
    safety.set('c1', { recallsCheckedAt: CHECKED, recalls: [recall('1')], complaints: [] })
    expect(model.getState().status).toBe('checking')
  })

  it('puts warranty extensions and campaigns apart from the other bulletins', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      bulletinsCheckedAt: CHECKED,
      recalls: [],
      complaints: [],
      bulletins: [
        bulletin(1, { components: ['POWER TRAIN'], issuedOn: '2020-01-01' }),
        bulletin(2, { kind: 'warranty', issuedOn: '2021-01-01' }),
        bulletin(3, { components: ['POWER TRAIN'], issuedOn: '2024-01-01' }),
        bulletin(4, { kind: 'campaign' }),
      ],
    })
    const s = model.getState()
    expect(s.bulletinsChecked).toBe(true)
    expect(s.extensions.map((b) => b.nhtsaId)).toEqual([2, 4])
    expect(s.bulletinGroups).toEqual([
      {
        component: 'POWER TRAIN',
        bulletins: [
          bulletin(3, { components: ['POWER TRAIN'], issuedOn: '2024-01-01' }),
          bulletin(1, { components: ['POWER TRAIN'], issuedOn: '2020-01-01' }),
        ],
      },
    ])
  })

  it('says bulletins are not imported yet rather than that there are none', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', { recallsCheckedAt: CHECKED, recalls: [], complaints: [] })
    expect(model.getState()).toMatchObject({ bulletinsChecked: false, extensions: [] })
  })

  const withMileage = (component: string, from: number, count: number): ComplaintSummary => ({
    ...complaints(component, count),
    byMileage: [{ from, complaints: count }],
  })

  it("shows what owners reported around the car's mileage", () => {
    const { model, safety } = setup({
      readings: [{ vehicleId: 'v1', date: TODAY, miles: 88_040 }],
    })
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      complaintsCheckedAt: CHECKED,
      recalls: [],
      complaints: [withMileage('ENGINE', 90_000, 6), withMileage('STEERING', 40_000, 9)],
      bulletins: [bulletin(1)],
    })
    expect(model.getState().nearby).toEqual({
      status: 'ready',
      window: '80,000–100,000 mi',
      issues: [{ component: 'ENGINE', complaints: 6, bulletins: 1, covered: false }],
    })
  })

  it('moves the window when a new odometer reading arrives', async () => {
    const { model, safety, odometer } = setup({
      readings: [{ vehicleId: 'v1', date: TODAY, miles: 35_000 }],
    })
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      recalls: [],
      complaints: [withMileage('ENGINE', 90_000, 6), withMileage('STEERING', 40_000, 9)],
    })
    expect(model.getState().nearby.issues.map((i) => i.component)).toEqual(['STEERING'])
    await odometer.add({ vehicleId: 'v1', date: TODAY, miles: 91_000 })
    expect(model.getState().nearby.issues.map((i) => i.component)).toEqual(['ENGINE'])
  })

  it('asks for the mileage when the car has no reading', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      recalls: [],
      complaints: [withMileage('ENGINE', 90_000, 6)],
    })
    expect(model.getState().nearby.status).toBe('no-odometer')
  })

  it('shows no mileage card before complaint mileages are known', () => {
    const { model, safety } = setup({
      readings: [{ vehicleId: 'v1', date: TODAY, miles: 88_000 }],
    })
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      recalls: [],
      complaints: [complaints('ENGINE', 5)],
    })
    expect(model.getState().nearby.status).toBe('no-data')
  })
})
