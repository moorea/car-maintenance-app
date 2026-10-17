import { describe, expect, it } from 'vitest'
import type { Vehicle, Warranty } from '../../domain/types'
import {
  fixedClock,
  memoryOdometer,
  memoryReportExporter,
  memorySchedule,
  memoryServiceRecords,
  memoryWarranties,
  sequentialIds,
} from '../../testing'
import { createWarrantyModel } from './model'

const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2024,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV',
  severeDuty: false,
}

const powertrain: Warranty = {
  id: 'w-pt',
  vehicleId: 'v1',
  kind: 'powertrain',
  provider: 'Toyota',
  startsOn: '2024-03-14',
  months: 60,
  endMiles: 60_000,
}
const basic: Warranty = {
  ...powertrain,
  id: 'w-basic',
  kind: 'basic',
  months: 36,
  endMiles: 36_000,
}

const setup = (initial: Warranty[] = [], today = '2026-10-17') => {
  const warranties = memoryWarranties(initial)
  const exporter = memoryReportExporter()
  const records = memoryServiceRecords([
    { id: 'r1', vehicleId: 'v1', itemId: 'oil', performedOn: '2026-07-01', odometerMiles: 30_000 },
  ])
  const odometer = memoryOdometer([
    { vehicleId: 'v1', date: '2024-03-14', miles: 10 },
    { vehicleId: 'v1', date: '2026-10-10', miles: 34_000 },
  ])
  const model = createWarrantyModel({
    vehicle: car,
    warranties,
    records,
    odometer,
    schedule: memorySchedule([
      { id: 'oil', configId: 'c1', task: 'Oil change', intervalMiles: 5_000, intervalMonths: 6 },
    ]),
    exporter,
    clock: fixedClock(today),
    ids: sequentialIds('w'),
  })
  model.getState().start()
  return { model, warranties, exporter, odometer }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('warranty screen', () => {
  it('lists coverage ending soonest first, with what is left', async () => {
    const { model } = setup([powertrain, basic])
    await settle()
    const { rows, status } = model.getState()
    expect(status).toBe('ready')
    expect(rows.map((r) => [r.title, r.state])).toEqual([
      // About 34,000 miles at roughly 36 a day reaches 36,000 within 90 days.
      ['Bumper-to-bumper', 'ending-soon'],
      ['Powertrain', 'active'],
    ])
    expect(rows[1]?.status).toBe('Covered until Mar 14, 2029 or 60,000 mi')
    expect(rows[1]?.subtitle).toBe('Toyota')
  })

  it('puts ended coverage last', async () => {
    const { model } = setup([basic, powertrain], '2027-06-01')
    await settle()
    expect(model.getState().rows.map((r) => r.state)).toEqual(['active', 'ended'])
  })

  it('moves a mileage limit closer when a new odometer reading arrives', async () => {
    const { model, odometer } = setup([basic])
    await settle()
    expect(model.getState().rows[0]?.state).toBe('ending-soon')
    await odometer.add({ vehicleId: 'v1', date: '2026-10-17', miles: 36_200 })
    await settle()
    expect(model.getState().rows[0]?.status).toBe('Ended at 36,000 mi')
  })

  it("adds a warranty, starting from the car's make and today's date", async () => {
    const { model, warranties } = setup()
    model.getState().openNew()
    expect(model.getState().form?.draft.provider).toBe('Toyota')
    expect(model.getState().form?.draft.startsOn).toBe('2026-10-17')
    model.getState().setField('kind', 'powertrain')
    model.getState().setField('startsOn', '2024-03-14')
    model.getState().setField('months', '60')
    model.getState().setField('endMiles', '60,000')
    model.getState().setField('policyNumber', ' PT-1 ')
    expect(await model.getState().save()).toBe(true)
    expect(model.getState().form).toBeUndefined()
    expect(await warranties.listForVehicle('v1')).toEqual([
      {
        id: 'w-1',
        vehicleId: 'v1',
        kind: 'powertrain',
        provider: 'Toyota',
        startsOn: '2024-03-14',
        months: 60,
        endMiles: 60_000,
        policyNumber: 'PT-1',
      },
    ])
    await settle()
    expect(model.getState().rows).toHaveLength(1)
  })

  it('needs a time limit or a mileage limit', async () => {
    const { model, warranties } = setup()
    model.getState().openNew()
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().form?.fieldErrors.months).toBe(
      'Enter how long it lasts, its mileage limit, or both',
    )
    model.getState().setField('endMiles', '100000')
    expect(model.getState().form?.fieldErrors.months).toBeUndefined()
    expect(await model.getState().save()).toBe(true)
    expect((await warranties.listForVehicle('v1'))[0]?.months).toBeUndefined()
  })

  it('explains numbers it cannot read', async () => {
    const { model } = setup()
    model.getState().openNew()
    model.getState().setField('months', 'three')
    model.getState().setField('endMiles', '36k')
    model.getState().setField('startsOn', 'March 2024')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().form?.fieldErrors).toEqual({
      months: 'Enter whole months, like 36',
      endMiles: 'Enter whole miles, like 36,000',
      startsOn: 'Enter the start date as YYYY-MM-DD',
    })
  })

  it('edits a warranty in place, keeping its id', async () => {
    const { model, warranties } = setup([basic])
    await settle()
    model.getState().openEdit('w-basic')
    expect(model.getState().form?.draft).toMatchObject({
      months: '36',
      endMiles: '36,000',
      kind: 'basic',
    })
    model.getState().setField('months', '30')
    expect(await model.getState().save()).toBe(true)
    const saved = await warranties.listForVehicle('v1')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ id: 'w-basic', months: 30 })
  })

  it('asks before deleting, then deletes', async () => {
    const { model, warranties } = setup([basic])
    await settle()
    model.getState().openEdit('w-basic')
    expect(await model.getState().remove()).toBe(false)
    expect(model.getState().form?.confirmingDelete).toBe(true)
    expect(await warranties.listForVehicle('v1')).toHaveLength(1)
    expect(await model.getState().remove()).toBe(true)
    expect(await warranties.listForVehicle('v1')).toEqual([])
    expect(model.getState().form).toBeUndefined()
  })

  it('keeps the form open with the error when saving fails', async () => {
    const { model, warranties } = setup()
    model.getState().openNew()
    model.getState().setField('months', '36')
    warranties.failNext('Disk full')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().form).toMatchObject({ saving: false, error: 'Disk full' })
  })

  it('shares a care report with the warranties and the service history', async () => {
    const { model, exporter } = setup([basic])
    await model.getState().shareReport()
    expect(model.getState().report).toEqual({ status: 'idle' })
    expect(exporter.shared).toHaveLength(1)
    const [report] = exporter.shared
    expect(report?.title).toBe('2024 Toyota RAV4')
    expect(report?.warranties.map((w) => w.coverage)).toEqual(['Bumper-to-bumper'])
    expect(report?.history.map((h) => h.what)).toEqual(['Oil change'])
  })

  it('says when the report could not be made', async () => {
    const { model, exporter } = setup()
    exporter.failNext('No PDF printer')
    await model.getState().shareReport()
    expect(model.getState().report).toEqual({ status: 'idle', error: 'No PDF printer' })
  })

  it('ignores an edit for a warranty it does not have', async () => {
    const { model } = setup([basic])
    await settle()
    model.getState().openEdit('missing')
    expect(model.getState().form).toBeUndefined()
  })

  it('closes the form without saving', async () => {
    const { model, warranties } = setup()
    model.getState().openNew()
    model.getState().setField('months', '36')
    model.getState().closeForm()
    expect(model.getState().form).toBeUndefined()
    expect(await warranties.listForVehicle('v1')).toEqual([])
  })

  it('cannot delete a warranty that has not been saved', async () => {
    const { model } = setup()
    model.getState().openNew()
    expect(await model.getState().remove()).toBe(false)
    expect(model.getState().form?.confirmingDelete).toBe(false)
  })

  it('stops asking to confirm once the owner edits a field', async () => {
    const { model } = setup([basic])
    await settle()
    model.getState().openEdit('w-basic')
    await model.getState().remove()
    model.getState().setField('notes', 'Call first')
    expect(model.getState().form?.confirmingDelete).toBe(false)
  })

  it('keeps the warranty and says so when deleting fails', async () => {
    const { model, warranties } = setup([basic])
    await settle()
    model.getState().openEdit('w-basic')
    await model.getState().remove()
    warranties.failNext('Offline and out of space')
    expect(await model.getState().remove()).toBe(false)
    expect(model.getState().form).toMatchObject({
      saving: false,
      confirmingDelete: false,
      error: 'Offline and out of space',
    })
    expect(await warranties.listForVehicle('v1')).toHaveLength(1)
  })

  it('stops following changes once disposed', async () => {
    const { model, warranties } = setup()
    await settle()
    model.getState().dispose()
    await warranties.save(basic)
    await settle()
    expect(model.getState().rows).toEqual([])
  })

  it('still shows the screen when the car data cannot be read', async () => {
    const failing = setup()
    const model = createWarrantyModel({
      vehicle: car,
      warranties: memoryWarranties([basic]),
      records: {
        ...memoryServiceRecords(),
        listForVehicle: () => Promise.reject(new Error('locked')),
      },
      odometer: memoryOdometer(),
      schedule: memorySchedule(),
      exporter: failing.exporter,
      clock: fixedClock('2026-10-17'),
      ids: sequentialIds(),
    })
    model.getState().start()
    await settle()
    expect(model.getState().status).toBe('ready')
  })

  it('builds the report without a schedule before the car has synced', async () => {
    const exporter = memoryReportExporter()
    const { configId: _config, ...unsynced } = car
    const model = createWarrantyModel({
      vehicle: unsynced,
      warranties: memoryWarranties(),
      records: memoryServiceRecords(),
      odometer: memoryOdometer(),
      schedule: memorySchedule(),
      exporter,
      clock: fixedClock('2026-10-17'),
      ids: sequentialIds(),
    })
    await model.getState().shareReport()
    expect(exporter.shared[0]?.schedule).toEqual([])
  })

  it('keeps a short dealer warranty exact through an edit', async () => {
    const { model, warranties } = setup([{ ...basic, months: 3, endMiles: 3_000 }])
    await settle()
    model.getState().openEdit('w-basic')
    expect(model.getState().form?.draft.months).toBe('3')
    model.getState().setField('notes', 'Dealer used-car warranty')
    expect(await model.getState().save()).toBe(true)
    expect((await warranties.listForVehicle('v1'))[0]?.months).toBe(3)
  })
})
