import { describe, expect, it } from 'vitest'
import { fixedClock, memoryServiceRecords, sequentialIds } from '../../testing'
import { createServiceLogModel } from './model'

const setup = () => {
  const records = memoryServiceRecords([
    { id: 'old', vehicleId: 'v1', performedOn: '2026-01-10', shop: 'Old shop' },
    { id: 'other-car', vehicleId: 'v2', performedOn: '2026-05-01' },
  ])
  const model = createServiceLogModel({
    vehicleId: 'v1',
    records,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('rec'),
  })
  model.getState().start()
  return { model, records }
}

describe('service log screen model', () => {
  it('stays loading until started', () => {
    const model = createServiceLogModel({
      vehicleId: 'v1',
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
      odometerMiles: 'Miles cannot be negative',
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
})
