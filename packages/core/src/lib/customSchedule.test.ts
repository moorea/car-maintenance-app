import { describe, expect, it } from 'vitest'
import type { CustomItem, MaintenanceItem } from '../domain/types'
import { memoryCustomItems } from '../testing'
import { applyCustomItems, withCustomItems } from './customSchedule'

const oil: MaintenanceItem = {
  id: 'oil',
  configId: 'c1',
  task: 'Oil & filter change',
  source: 'motor',
  intervalMiles: 10_000,
  intervalMonths: 12,
  severeMiles: 5_000,
  severeMonths: 6,
}
const tires: MaintenanceItem = {
  id: 'tires',
  configId: 'c1',
  task: 'Tire rotation',
  intervalMiles: 5_000,
}

const custom = (fields: Partial<CustomItem> & Pick<CustomItem, 'id'>): CustomItem => ({
  vehicleId: 'v1',
  task: 'Cabin air filter',
  intervalMonths: 12,
  ...fields,
})

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('applyCustomItems', () => {
  it("replaces a schedule item's intervals with the owner's, for normal and severe driving", () => {
    const own = custom({ id: 'x', replacesItemId: 'oil', task: 'Oil', intervalMiles: 5_000 })
    const { intervalMonths: _, ...ownMilesOnly } = own
    expect(applyCustomItems([oil, tires], [ownMilesOnly], { configId: 'c1' })).toEqual([
      // The schedule's name and source stay; only the owner's interval applies.
      {
        id: 'oil',
        configId: 'c1',
        task: 'Oil & filter change',
        source: 'motor',
        intervalMiles: 5_000,
        owner: 'changed',
      },
      tires,
    ])
  })

  it("adds the owner's own items after the schedule, by name", () => {
    const items = applyCustomItems(
      [oil],
      [
        custom({ id: 'b', task: 'Wiper blades' }),
        custom({ id: 'a', task: 'Cabin air filter', intervalMiles: 15_000 }),
      ],
      { configId: 'c1' },
    )
    expect(items.map((i) => [i.id, i.task, i.owner])).toEqual([
      ['oil', 'Oil & filter change', undefined],
      ['a', 'Cabin air filter', 'added'],
      ['b', 'Wiper blades', 'added'],
    ])
    expect(items[1]).toMatchObject({ source: 'owner', intervalMiles: 15_000, intervalMonths: 12 })
  })

  it("gives a car without a configuration only the owner's items", () => {
    expect(applyCustomItems([], [custom({ id: 'a' })], {})).toMatchObject([
      { id: 'a', configId: '', task: 'Cabin air filter' },
    ])
  })

  it('drops a replacement whose schedule item has gone', () => {
    expect(
      applyCustomItems([tires], [custom({ id: 'x', replacesItemId: 'oil' })], { configId: 'c1' }),
    ).toEqual([tires])
  })

  it('uses the same replacement on every phone when two replaced one item before syncing', () => {
    const later = custom({ id: 'z', replacesItemId: 'oil', intervalMiles: 3_000 })
    const earlier = custom({ id: 'k', replacesItemId: 'oil', intervalMiles: 7_500 })
    for (const order of [
      [later, earlier],
      [earlier, later],
    ])
      expect(applyCustomItems([oil], order, { configId: 'c1' })[0]?.intervalMiles).toBe(7_500)
  })
})

describe('withCustomItems', () => {
  const base = { itemsForConfig: async (configId: string) => (configId === 'c1' ? [oil] : []) }

  it("reads the car's schedule with the owner's changes applied", async () => {
    const schedule = withCustomItems(base, memoryCustomItems([custom({ id: 'a' })]))
    expect((await schedule.itemsForVehicle({ id: 'v1', configId: 'c1' })).map((i) => i.id)).toEqual(
      ['oil', 'a'],
    )
    expect(await schedule.itemsForConfig('c1')).toEqual([oil])
  })

  it('tells watchers about each change the owner makes, and stops when asked', async () => {
    const own = memoryCustomItems()
    const schedule = withCustomItems(base, own)
    const seen: string[][] = []
    const stop = schedule.watchForVehicle({ id: 'v1', configId: 'c1' }, (items) =>
      seen.push(items.map((i) => i.id)),
    )
    await settle()
    await own.save(custom({ id: 'a' }))
    await settle()
    // Another car's items stay off this car's schedule.
    await own.save(custom({ id: 'b', vehicleId: 'v2' }))
    await settle()
    stop()
    await own.remove('a')
    await settle()
    expect(seen).toEqual([['oil'], ['oil', 'a'], ['oil', 'a']])
  })
})
