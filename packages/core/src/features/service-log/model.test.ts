import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, ServiceRecord } from '../../domain/types'
import { fixedClock, memorySchedule, memoryServiceRecords, sequentialIds } from '../../testing'
import { createServiceLogModel } from './model'

const tasks: MaintenanceItem[] = [
  { id: 'oil', configId: 'c1', task: 'Oil & filter change', intervalMiles: 10_000 },
  { id: 'tires', configId: 'c1', task: 'Tire rotation', intervalMiles: 5_000 },
]

const setup = (
  initial: ServiceRecord[] = [
    { id: 'old', vehicleId: 'v1', performedOn: '2026-01-10', shop: 'Old shop' },
    { id: 'other-car', vehicleId: 'v2', performedOn: '2026-05-01' },
  ],
  startWith?: { itemId?: string },
) => {
  const records = memoryServiceRecords(initial)
  const model = createServiceLogModel({
    vehicleId: 'v1',
    configId: 'c1',
    startWith,
    schedule: memorySchedule(tasks),
    records,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('rec'),
  })
  model.getState().start()
  return { model, records }
}

// The in-memory schedule resolves at once, so a few microtask turns let it arrive.
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('service log screen model', () => {
  it('stays loading until started', () => {
    const model = createServiceLogModel({
      vehicleId: 'v1',
      schedule: memorySchedule(),
      records: memoryServiceRecords(),
      clock: fixedClock('2026-10-17'),
      ids: sequentialIds(),
    })
    expect(model.getState().status).toBe('loading')
  })

  it("loads this car's records and a draft dated today", () => {
    const { model } = setup()
    const s = model.getState()
    expect(s.status).toBe('ready')
    expect(s.records.map((r) => r.id)).toEqual(['old'])
    expect(s.draft.performedOn).toBe('2026-10-17')
  })

  it('saves a valid draft, shows it newest first and resets the form', async () => {
    const { model } = setup()
    const { setField, save } = model.getState()
    setField('odometerMiles', '41250')
    setField('cost', '89.99')
    setField('shop', '  Main St Garage ')

    expect(await save()).toBe(true)

    const s = model.getState()
    expect(s.records[0]).toEqual({
      id: 'rec-1',
      vehicleId: 'v1',
      performedOn: '2026-10-17',
      odometerMiles: 41_250,
      costCents: 8_999,
      shop: 'Main St Garage',
    })
    expect(s.draft.shop).toBe('')
    expect(s.status).toBe('ready')
  })

  it('reports field errors without saving', async () => {
    const { model } = setup()
    model.getState().setField('odometerMiles', '-5')
    model.getState().setField('performedOn', 'yesterday')

    expect(await model.getState().save()).toBe(false)

    const s = model.getState()
    expect(s.fieldErrors).toEqual({
      odometerMiles: 'Enter whole miles, digits only',
      performedOn: 'Enter a date as YYYY-MM-DD',
    })
    expect(s.records).toHaveLength(1)
  })

  it('clears a field error when that field is edited', async () => {
    const { model } = setup()
    model.getState().setField('odometerMiles', 'abc')
    await model.getState().save()
    model.getState().setField('odometerMiles', '100')
    expect(model.getState().fieldErrors.odometerMiles).toBeUndefined()
  })

  it('surfaces a storage failure as an error state', async () => {
    const { model, records } = setup()
    records.failNextAdd('Disk full')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState()).toMatchObject({ status: 'error', saveError: 'Disk full' })
  })

  it('clears a previous save error once a save succeeds', async () => {
    const { model, records } = setup()
    records.failNextAdd('Disk full')
    await model.getState().save()
    expect(await model.getState().save()).toBe(true)
    expect(model.getState()).toMatchObject({ status: 'ready', saveError: undefined })
  })

  it('ignores a second save while the first is still running', async () => {
    const { model } = setup()
    const first = model.getState().save()
    const second = model.getState().save()
    expect(await Promise.all([first, second])).toEqual([true, false])
    expect(model.getState().records).toHaveLength(2)
  })

  it('rejects numbers written in unusual notation', async () => {
    const { model } = setup()
    model.getState().setField('odometerMiles', '1e3')
    model.getState().setField('cost', '0x10')
    expect(await model.getState().save()).toBe(false)
    expect(Object.keys(model.getState().fieldErrors).sort()).toEqual(['cost', 'odometerMiles'])
  })

  it('stops receiving updates after dispose', async () => {
    const { model, records } = setup()
    model.getState().dispose()
    await records.add({ id: 'late', vehicleId: 'v1', performedOn: '2026-10-18' })
    expect(model.getState().records.map((r) => r.id)).toEqual(['old'])
  })

  it('picks up changes made while stopped when started again', async () => {
    const { model, records } = setup()
    model.getState().dispose()
    await records.add({ id: 'late', vehicleId: 'v1', performedOn: '2026-10-18' })
    model.getState().start()
    expect(model.getState().records.map((r) => r.id)).toEqual(['late', 'old'])
  })

  describe('history', () => {
    const history: ServiceRecord[] = [
      {
        id: 'a',
        vehicleId: 'v1',
        itemId: 'oil',
        performedOn: '2026-08-14',
        odometerMiles: 41_250,
        costCents: 8_995,
        shop: 'Main St Auto',
      },
      { id: 'b', vehicleId: 'v1', performedOn: '2026-10-02', costCents: 3_898, notes: 'Wipers' },
      {
        id: 'c',
        vehicleId: 'v1',
        itemId: 'tires',
        performedOn: '2025-05-20',
        costCents: 2_400,
        shop: 'Dealer',
      },
    ]

    it('groups records by month, newest first, naming the task done', async () => {
      const { model } = setup(history)
      await settle()
      const groups = model.getState().groups
      expect(groups.map((g) => g.label)).toEqual(['October', 'August', 'May 2025'])
      expect(groups[1]?.entries[0]).toEqual({
        id: 'a',
        month: 'Aug',
        day: '14',
        what: 'Oil & filter change',
        where: 'Main St Auto · 41,250 mi',
        cost: '$89.95',
      })
      expect(groups[0]?.entries[0]?.what).toBe('Wipers')
    })

    it('totals what was spent this year and counts every service', () => {
      const { model } = setup(history)
      expect(model.getState().summary).toEqual({
        spentLabel: 'Spent in 2026',
        spent: '$128.93',
        count: 3,
      })
    })

    it('filters by task, shop or notes, ignoring case', async () => {
      const { model } = setup(history)
      await settle()
      model.getState().setQuery('main st')
      expect(model.getState().groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual(['a'])
      model.getState().setQuery('TIRE')
      expect(model.getState().groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual(['c'])
      model.getState().setQuery('')
      expect(model.getState().groups).toHaveLength(3)
    })

    it("offers the car's scheduled tasks for what was done", async () => {
      const { model } = setup(history)
      await settle()
      expect(model.getState().tasks).toEqual([
        { id: 'oil', task: 'Oil & filter change' },
        { id: 'tires', task: 'Tire rotation' },
      ])
    })
  })

  describe('the form', () => {
    it('is closed until opened, and opens with a task chosen', () => {
      const { model } = setup()
      expect(model.getState().adding).toBe(false)
      model.getState().openForm('oil')
      expect(model.getState()).toMatchObject({ adding: true, draft: { itemId: 'oil' } })
      model.getState().closeForm()
      expect(model.getState().adding).toBe(false)
    })

    it('opens straight away when asked to log a task', () => {
      const { model } = setup(undefined, { itemId: 'tires' })
      expect(model.getState()).toMatchObject({ adding: true, draft: { itemId: 'tires' } })
    })

    it('closes once the service is saved', async () => {
      const { model } = setup()
      model.getState().openForm('oil')
      expect(await model.getState().save()).toBe(true)
      expect(model.getState()).toMatchObject({ adding: false, draft: { itemId: '' } })
      expect(model.getState().records[0]?.itemId).toBe('oil')
    })
  })
})
