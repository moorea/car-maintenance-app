import { describe, expect, it } from 'vitest'
import {
  fixedClock,
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
} from '../testing'
import { getDueItems } from './getDueItems'

describe('getDueItems', () => {
  const deps = () => ({
    vehicles: memoryVehicles([
      {
        id: 'v1',
        configId: 'rav4-2021',
        year: 2021,
        make: 'Toyota',
        model: 'RAV4',
        nickname: 'RAV4',
        severeDuty: false,
      },
    ]),
    schedule: memorySchedule([
      {
        id: 'oil',
        configId: 'rav4-2021',
        task: 'Oil and filter',
        intervalMiles: 10_000,
        intervalMonths: 12,
      },
      { id: 'rotate', configId: 'rav4-2021', task: 'Tyre rotation', intervalMiles: 5_000 },
      { id: 'other', configId: 'civic-2019', task: 'Not this car', intervalMiles: 1 },
    ]),
    records: memoryServiceRecords([
      {
        id: 's1',
        vehicleId: 'v1',
        itemId: 'oil',
        performedOn: '2026-07-01',
        odometerMiles: 30_000,
      },
      {
        id: 's2',
        vehicleId: 'v1',
        itemId: 'rotate',
        performedOn: '2026-07-01',
        odometerMiles: 30_000,
      },
    ]),
    odometer: memoryOdometer([{ vehicleId: 'v1', date: '2026-09-29', miles: 33_000 }]),
    clock: fixedClock('2026-10-01'),
  })

  it("projects this car's items, soonest first, learning mileage from records", async () => {
    // 3,000 miles over 90 days = 33.3/day, so about 33,067 today.
    // Rotation: 1,933 miles to 35,000 = 58 days. Oil: 6,933 miles to 40,000 = 208 days,
    // before its 12-month limit on 2027-07-01.
    const due = await getDueItems(deps())('v1')
    expect(due.map((d) => [d.itemId, d.dueDate, d.status])).toEqual([
      ['rotate', '2026-11-28', 'upcoming'],
      ['oil', '2027-04-27', 'upcoming'],
    ])
  })

  it('estimates the mileage of a service logged without an odometer reading', async () => {
    const d = deps()
    // Oil done yesterday with no miles entered: due 10,000 miles from ~33,033, not "due now".
    await d.records.add({ id: 's3', vehicleId: 'v1', itemId: 'oil', performedOn: '2026-09-30' })
    const oil = (await getDueItems(d)('v1')).find((i) => i.itemId === 'oil')
    expect(oil).toMatchObject({ status: 'upcoming', historyUnknown: false })
    expect(oil?.dueMiles).toBeCloseTo(43_033, 0)
  })

  it('has nothing due for a just-added car the server has not matched to a schedule yet', async () => {
    const d = deps()
    const v1 = await d.vehicles.get('v1')
    if (!v1) throw new Error('missing fixture')
    const { configId: _unmatched, ...justAdded } = v1
    d.vehicles.set([justAdded])
    expect(await getDueItems(d)('v1')).toEqual([])
  })

  it('fails loudly for an unknown vehicle', async () => {
    await expect(getDueItems(deps())('nope')).rejects.toThrow('Unknown vehicle nope')
  })
})
