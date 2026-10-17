import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServiceRecord, Vehicle } from '@car/core'
import { PowerSyncDatabase } from '@powersync/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PowerSyncBackendConnector } from '@powersync/common'
import { createPowerSyncRepositories, firstSyncOf } from './repositories'
import { powerSyncSessionDatabase } from './session'
import { schema } from './schema'

let dir: string
let db: InstanceType<typeof PowerSyncDatabase>

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'car-data-'))
  db = new PowerSyncDatabase({ schema, database: { dbFilename: 'test.db', dbLocation: dir } })
  await db.init()
})

afterEach(async () => {
  await db.close()
  rmSync(dir, { recursive: true, force: true })
})

const oilChange: ServiceRecord = {
  id: 'r1',
  vehicleId: 'v1',
  itemId: 'oil',
  performedOn: '2026-09-01',
  odometerMiles: 42_000,
  costCents: 8_999,
  shop: 'Quick Lube',
}

const collect = <T>(subscribe: (onChange: (value: T) => void) => () => void) => {
  const values: T[] = []
  const waitFor = (count: number) =>
    new Promise<T[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Got ${values.length} updates`)), 5_000)
      const check = () => {
        if (values.length >= count) {
          clearTimeout(timer)
          resolve(values)
        } else setTimeout(check, 10)
      }
      check()
    })
  const unsubscribe = subscribe((value) => values.push(value))
  return { waitFor, stop: () => unsubscribe() }
}

describe('PowerSync repositories', () => {
  it('reads back a saved service record with the same fields', async () => {
    const repos = createPowerSyncRepositories(db)
    await repos.records.add(oilChange)
    expect(await repos.records.listForVehicle('v1')).toEqual([oilChange])
    expect(await repos.records.listForVehicle('other')).toEqual([])
  })

  it('leaves optional fields absent rather than null', async () => {
    const repos = createPowerSyncRepositories(db)
    await repos.records.add({ id: 'r2', vehicleId: 'v1', performedOn: '2026-09-02' })
    const [record] = await repos.records.listForVehicle('v1')
    expect(record).toStrictEqual({ id: 'r2', vehicleId: 'v1', performedOn: '2026-09-02' })
  })

  it('lists the newest service first', async () => {
    const repos = createPowerSyncRepositories(db)
    await repos.records.add({ id: 'old', vehicleId: 'v1', performedOn: '2026-01-01' })
    await repos.records.add({ id: 'new', vehicleId: 'v1', performedOn: '2026-06-01' })
    const ids = (await repos.records.listForVehicle('v1')).map((r) => r.id)
    expect(ids).toEqual(['new', 'old'])
  })

  it('tells a watcher the current records, then again after each save', async () => {
    const repos = createPowerSyncRepositories(db)
    const updates = collect<ServiceRecord[]>((cb) => repos.records.watchForVehicle('v1', cb))
    await updates.waitFor(1)
    await repos.records.add(oilChange)
    const values = await updates.waitFor(2)
    expect(values[0]).toEqual([])
    expect(values.at(-1)).toEqual([oilChange])
  })

  it('stops telling a watcher about changes once it unsubscribes', async () => {
    const repos = createPowerSyncRepositories(db)
    const updates = collect<ServiceRecord[]>((cb) => repos.records.watchForVehicle('v1', cb))
    const before = (await updates.waitFor(1)).length
    updates.stop()
    await repos.records.add(oilChange)
    // Give a stray update time to arrive before checking that none did.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect((await updates.waitFor(0)).length).toBe(before)
  })

  it('queues local saves for upload', async () => {
    const repos = createPowerSyncRepositories(db)
    await repos.records.add(oilChange)
    await repos.odometer.add({ vehicleId: 'v1', date: '2026-09-01', miles: 42_000 })
    const tx = await db.getNextCrudTransaction()
    expect(tx?.crud.map((c) => [c.op, c.table])).toEqual([['PUT', 'service_records']])
  })

  it('remembers whose data the local copy holds, without queueing it for upload', async () => {
    const session = powerSyncSessionDatabase(db, {} as PowerSyncBackendConnector)
    expect(await session.owner()).toBeUndefined()
    await session.setOwner('user-a')
    await session.setOwner('user-b')
    expect(await session.owner()).toBe('user-b')
    expect(await session.pendingUploads()).toBe(0)
  })

  it("tells a watcher about the owner's vehicles only, and about each change", async () => {
    await db.execute(
      "insert into vehicles (id, owner_id, config_id, nickname) values ('v-b', 'u2', 'c1', 'Not mine')",
    )
    const repos = createPowerSyncRepositories(db)
    const updates = collect<Vehicle[]>((cb) => repos.vehicles.watchOwned('u1', cb))
    await updates.waitFor(1)
    await db.execute(
      "insert into vehicles (id, owner_id, config_id, nickname, severe_duty) values ('v-a', 'u1', 'c1', 'Civic', 0)",
    )
    const values = await updates.waitFor(2)
    updates.stop()
    expect(values[0]).toEqual([])
    expect(values.at(-1)).toEqual([
      { id: 'v-a', configId: 'c1', nickname: 'Civic', severeDuty: false },
    ])
  })

  it('does not report a first sync on a device that has never synced', async () => {
    const repos = createPowerSyncRepositories(db)
    let synced = false
    const stop = repos.sync.onFirstSync('u1', () => (synced = true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    stop()
    expect(synced).toBe(false)
  })

  it('reads vehicles, odometer readings and the schedule from synced rows', async () => {
    await db.execute(
      "insert into vehicles (id, config_id, nickname, severe_duty) values ('v1', 'c1', 'Civic', 1)",
    )
    await db.execute(
      "insert into maintenance_items (id, config_id, task, interval_miles, interval_months) values ('oil', 'c1', 'Oil change', 5000, 6)",
    )
    const repos = createPowerSyncRepositories(db)
    await repos.odometer.add({ vehicleId: 'v1', date: '2026-09-01', miles: 42_000 })

    expect(await repos.vehicles.get('v1')).toEqual({
      id: 'v1',
      configId: 'c1',
      nickname: 'Civic',
      severeDuty: true,
    })
    expect(await repos.vehicles.get('missing')).toBeUndefined()
    expect(await repos.odometer.listForVehicle('v1')).toEqual([
      { vehicleId: 'v1', date: '2026-09-01', miles: 42_000 },
    ])
    expect(await repos.schedule.itemsForConfig('c1')).toEqual([
      { id: 'oil', configId: 'c1', task: 'Oil change', intervalMiles: 5000, intervalMonths: 6 },
    ])
  })
})

describe('first sync', () => {
  const source = (state: { hasSynced: boolean; owner: string | undefined }) => {
    const listeners = new Set<() => void>()
    return {
      state,
      hasSynced: () => state.hasSynced,
      onStatusChanged: (onChange: () => void) => {
        listeners.add(onChange)
        return () => listeners.delete(onChange)
      },
      owner: async () => state.owner,
      change: (next: Partial<typeof state>) => {
        Object.assign(state, next)
        for (const l of [...listeners]) l()
      },
      listening: () => listeners.size,
    }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

  it("reports at once when this owner's copy has already synced", async () => {
    const calls: string[] = []
    firstSyncOf(source({ hasSynced: true, owner: 'u1' }), 'u1', () => calls.push('synced'))
    await settle()
    expect(calls).toEqual(['synced'])
  })

  it('waits for a sync that is still running, then stops listening', async () => {
    const s = source({ hasSynced: false, owner: 'u1' })
    const calls: string[] = []
    firstSyncOf(s, 'u1', () => calls.push('synced'))
    await settle()
    expect(calls).toEqual([])
    s.change({ hasSynced: true })
    await settle()
    s.change({})
    await settle()
    expect(calls).toEqual(['synced'])
    expect(s.listening()).toBe(0)
  })

  it("does not count another account's sync on the same phone", async () => {
    const s = source({ hasSynced: true, owner: 'u-previous' })
    const calls: string[] = []
    firstSyncOf(s, 'u1', () => calls.push('synced'))
    await settle()
    expect(calls).toEqual([])
    // The sync session clears the old copy, records the new owner, then syncs.
    s.change({ hasSynced: false, owner: undefined })
    s.change({ owner: 'u1' })
    await settle()
    expect(calls).toEqual([])
    s.change({ hasSynced: true })
    await settle()
    expect(calls).toEqual(['synced'])
  })

  it('checks again on the next status change after a failed read', async () => {
    const s = source({ hasSynced: true, owner: 'u1' })
    let fail = true
    const flaky = {
      ...s,
      owner: async () => {
        if (fail) throw new Error('database closed')
        return s.state.owner
      },
    }
    const calls: string[] = []
    firstSyncOf(flaky, 'u1', () => calls.push('synced'))
    await settle()
    expect(calls).toEqual([])
    fail = false
    s.change({})
    await settle()
    expect(calls).toEqual(['synced'])
  })

  it('reports nothing after it is stopped', async () => {
    const s = source({ hasSynced: false, owner: 'u1' })
    const calls: string[] = []
    const stop = firstSyncOf(s, 'u1', () => calls.push('synced'))
    stop()
    s.change({ hasSynced: true })
    await settle()
    expect(calls).toEqual([])
  })
})
