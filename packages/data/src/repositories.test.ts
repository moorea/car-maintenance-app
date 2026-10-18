import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  CustomItem,
  FillUp,
  MaintenanceItem,
  OdometerReading,
  Renewal,
  SafetyReport,
  ServiceRecord,
  Vehicle,
  Warranty,
} from '@car/core'
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
  /** The first value that passes, for watchers that settle over several updates. */
  const waitUntil = (passes: (value: T) => boolean) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`No match in ${values.length} updates`)),
        5_000,
      )
      const check = () => {
        const match = values.find(passes)
        if (match) {
          clearTimeout(timer)
          resolve(match)
        } else setTimeout(check, 10)
      }
      check()
    })
  const unsubscribe = subscribe((value) => values.push(value))
  return { waitFor, waitUntil, stop: () => unsubscribe() }
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

  it('tells an odometer watcher the current readings, then again after each save', async () => {
    const repos = createPowerSyncRepositories(db)
    const reading: OdometerReading = { vehicleId: 'v1', date: '2026-09-01', miles: 42_000 }
    const updates = collect<OdometerReading[]>((cb) => repos.odometer.watchForVehicle('v1', cb))
    await updates.waitFor(1)
    await repos.odometer.add(reading)
    await repos.odometer.add({ vehicleId: 'other', date: '2026-09-01', miles: 1 })
    const values = await updates.waitFor(2)
    // Let any later emission for the other car's reading land before checking none mention it.
    await new Promise((resolve) => setTimeout(resolve, 100))
    updates.stop()
    expect(values[0]).toEqual([])
    expect(values.at(-1)).toEqual([reading])
    expect(values.flat().every((r) => r.vehicleId === 'v1')).toBe(true)
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

  it('reads back a saved warranty, leaving optional fields absent', async () => {
    const repos = createPowerSyncRepositories(db)
    const warranty: Warranty = {
      id: 'w1',
      vehicleId: 'v1',
      kind: 'powertrain',
      startsOn: '2024-03-14',
      endMiles: 60_000,
    }
    await repos.warranties.save(warranty)
    expect(await repos.warranties.listForVehicle('v1')).toStrictEqual([warranty])
    expect(await repos.warranties.listForVehicle('other')).toEqual([])
  })

  it('uploads a new warranty as an insert, an edit as only what changed, and a delete', async () => {
    const repos = createPowerSyncRepositories(db)
    const warranty: Warranty = {
      id: 'w1',
      vehicleId: 'v1',
      kind: 'basic',
      provider: 'Toyota',
      startsOn: '2024-03-14',
      months: 36,
      endMiles: 36_000,
    }
    await repos.warranties.save(warranty)
    await repos.warranties.save({ ...warranty, months: 30 })
    // Saving it unchanged queues nothing.
    await repos.warranties.save({ ...warranty, months: 30 })
    await repos.warranties.remove('w1')
    const ops: [string, Record<string, unknown> | undefined][] = []
    for (let tx = await db.getNextCrudTransaction(); tx; tx = await db.getNextCrudTransaction()) {
      ops.push(
        ...tx.crud.map((c) => [c.op, c.opData] as [string, Record<string, unknown> | undefined]),
      )
      await tx.complete()
    }
    expect(ops.map(([op]) => op)).toEqual(['PUT', 'PATCH', 'DELETE'])
    expect(Object.keys(ops[1]?.[1] ?? {}).sort()).toEqual(['months', 'updated_at'])
    expect(await repos.warranties.listForVehicle('v1')).toEqual([])
  })

  it("tells a watcher about the car's warranties after each change", async () => {
    const repos = createPowerSyncRepositories(db)
    const updates = collect<Warranty[]>((cb) => repos.warranties.watchForVehicle('v1', cb))
    await updates.waitFor(1)
    await repos.warranties.save({
      id: 'w1',
      vehicleId: 'v1',
      kind: 'extended',
      startsOn: '2026-01-01',
      months: 48,
    })
    const values = await updates.waitFor(2)
    expect(values.at(-1)?.map((w) => w.kind)).toEqual(['extended'])
    updates.stop()
  })

  it('reads back renewals soonest first, and uploads renewing one as only its new date', async () => {
    const repos = createPowerSyncRepositories(db)
    const insurance: Renewal = {
      id: 'r2',
      vehicleId: 'v1',
      kind: 'insurance',
      dueOn: '2027-03-01',
      everyMonths: 6,
      notes: 'Policy 77',
    }
    const permit: Renewal = {
      id: 'r1',
      vehicleId: 'v1',
      kind: 'other',
      title: 'Permit',
      dueOn: '2026-12-01',
    }
    await repos.renewals.save(insurance)
    await repos.renewals.save(permit)
    expect(await repos.renewals.listForVehicle('v1')).toStrictEqual([permit, insurance])

    await repos.renewals.save({ ...insurance, dueOn: '2027-09-01' })
    await repos.renewals.remove('r1')
    const ops: [string, Record<string, unknown> | undefined][] = []
    for (let tx = await db.getNextCrudTransaction(); tx; tx = await db.getNextCrudTransaction()) {
      ops.push(
        ...tx.crud.map((c) => [c.op, c.opData] as [string, Record<string, unknown> | undefined]),
      )
      await tx.complete()
    }
    expect(ops.map(([op]) => op)).toEqual(['PUT', 'PUT', 'PATCH', 'DELETE'])
    expect(Object.keys(ops[2]?.[1] ?? {}).sort()).toEqual(['due_on', 'updated_at'])
  })

  it('reads back fill-ups newest first, with switches and decimals intact', async () => {
    const repos = createPowerSyncRepositories(db)
    const older: FillUp = {
      id: 'f1',
      vehicleId: 'v1',
      filledOn: '2026-09-01',
      odometerMiles: 41_000,
      energy: 'fuel',
      quantity: 12.481,
      costCents: 4_820,
      full: true,
      missedPrevious: false,
      station: 'Costco',
    }
    const newer: FillUp = {
      id: 'f2',
      vehicleId: 'v1',
      filledOn: '2026-09-10',
      odometerMiles: 41_300,
      energy: 'electric',
      quantity: 40,
      full: false,
      missedPrevious: true,
    }
    await repos.fillUps.save(older)
    await repos.fillUps.save(newer)
    expect(await repos.fillUps.listForVehicle('v1')).toStrictEqual([newer, older])
    expect(await repos.fillUps.listForVehicle('other')).toEqual([])
  })

  it('uploads a new fill-up as an insert, an edit as only what changed, and a delete', async () => {
    const repos = createPowerSyncRepositories(db)
    const fillUp: FillUp = {
      id: 'f1',
      vehicleId: 'v1',
      filledOn: '2026-09-01',
      odometerMiles: 41_000,
      energy: 'fuel',
      quantity: 12,
      full: true,
      missedPrevious: false,
    }
    await repos.fillUps.save(fillUp)
    await repos.fillUps.save({ ...fillUp, odometerMiles: 41_100, full: false })
    await repos.fillUps.save({ ...fillUp, odometerMiles: 41_100, full: false })
    await repos.fillUps.remove('f1')
    const ops: [string, Record<string, unknown> | undefined][] = []
    for (let tx = await db.getNextCrudTransaction(); tx; tx = await db.getNextCrudTransaction()) {
      ops.push(
        ...tx.crud.map((c) => [c.op, c.opData] as [string, Record<string, unknown> | undefined]),
      )
      await tx.complete()
    }
    expect(ops.map(([op]) => op)).toEqual(['PUT', 'PATCH', 'DELETE'])
    expect(Object.keys(ops[1]?.[1] ?? {}).sort()).toEqual([
      'full_tank',
      'odometer_miles',
      'updated_at',
    ])
  })

  it("tells a watcher about the car's fill-ups after each change", async () => {
    const repos = createPowerSyncRepositories(db)
    const updates = collect<FillUp[]>((cb) => repos.fillUps.watchForVehicle('v1', cb))
    await updates.waitFor(1)
    await repos.fillUps.save({
      id: 'f1',
      vehicleId: 'v1',
      filledOn: '2026-09-01',
      odometerMiles: 41_000,
      energy: 'fuel',
      quantity: 12,
      full: true,
      missedPrevious: false,
    })
    const values = await updates.waitFor(2)
    expect(values.at(-1)?.map((f) => f.odometerMiles)).toEqual([41_000])
    updates.stop()
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
      "insert into vehicles (id, owner_id, config_id, year, make, model, nickname) values ('v-b', 'u2', 'c1', 2020, 'Honda', 'Civic', 'Not mine')",
    )
    const repos = createPowerSyncRepositories(db)
    const updates = collect<Vehicle[]>((cb) => repos.vehicles.watchOwned('u1', cb))
    await updates.waitFor(1)
    await db.execute(
      "insert into vehicles (id, owner_id, config_id, year, make, model, nickname, severe_duty) values ('v-a', 'u1', 'c1', 2020, 'Honda', 'Civic', 'Civic', 0)",
    )
    const values = await updates.waitFor(2)
    updates.stop()
    expect(values[0]).toEqual([])
    expect(values.at(-1)).toEqual([
      {
        id: 'v-a',
        configId: 'c1',
        year: 2020,
        make: 'Honda',
        model: 'Civic',
        nickname: 'Civic',
        severeDuty: false,
      },
    ])
  })

  it('adds a car with its first reading in one upload, leaving the config to the server', async () => {
    const repos = createPowerSyncRepositories(db)
    const accord: Vehicle = {
      id: 'v-new',
      vin: '1HGCM82633A004352',
      year: 2003,
      make: 'Honda',
      model: 'Accord',
      trim: 'EX-V6',
      engine: '3.0L 6-cyl',
      nickname: 'Accord',
      severeDuty: true,
    }
    await repos.vehicles.add('u1', accord, { vehicleId: 'v-new', date: '2026-10-17', miles: 1 })

    expect(await repos.vehicles.get('v-new')).toStrictEqual(accord)
    expect(await repos.odometer.listForVehicle('v-new')).toEqual([
      { vehicleId: 'v-new', date: '2026-10-17', miles: 1 },
    ])
    const transaction = await db.getNextCrudTransaction()
    expect(transaction?.crud.map((c) => c.table)).toEqual(['vehicles', 'odometer_readings'])
    expect(transaction?.crud[0]?.opData).toMatchObject({ owner_id: 'u1', severe_duty: 1 })
    expect(transaction?.crud[0]?.opData).not.toHaveProperty('config_id')
  })

  it('switches a car to the severe schedule and uploads only that change', async () => {
    const repos = createPowerSyncRepositories(db)
    const car: Vehicle = {
      id: 'v-sev',
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      nickname: 'RAV4',
      severeDuty: false,
    }
    await repos.vehicles.add('u1', car)
    await (await db.getNextCrudTransaction())?.complete()

    await repos.vehicles.setSevereDuty('v-sev', true)

    expect(await repos.vehicles.get('v-sev')).toMatchObject({ severeDuty: true })
    const transaction = await db.getNextCrudTransaction()
    expect(transaction?.crud).toHaveLength(1)
    expect(transaction?.crud[0]).toMatchObject({ table: 'vehicles', id: 'v-sev', op: 'PATCH' })
    expect(Object.keys(transaction?.crud[0]?.opData ?? {}).sort()).toEqual([
      'severe_duty',
      'updated_at',
    ])
  })

  it('adds a car without a reading when the owner gives no mileage', async () => {
    const repos = createPowerSyncRepositories(db)
    const car: Vehicle = {
      id: 'v2',
      year: 2019,
      make: 'Toyota',
      model: 'RAV4',
      nickname: 'Rav',
      severeDuty: false,
    }
    await repos.vehicles.add('u1', car)
    expect(await repos.vehicles.get('v2')).toStrictEqual(car)
    expect(await repos.odometer.listForVehicle('v2')).toEqual([])
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
      "insert into vehicles (id, config_id, year, make, model, nickname, severe_duty) values ('v1', 'c1', 2020, 'Honda', 'Civic', 'Civic', 1)",
    )
    await db.execute(
      "insert into maintenance_items (id, config_id, kind, source, task, interval_miles, interval_months) values ('oil', 'c1', 'engine-oil', 'baseline', 'Oil change', 5000, 6)",
    )
    const repos = createPowerSyncRepositories(db)
    await repos.odometer.add({ vehicleId: 'v1', date: '2026-09-01', miles: 42_000 })

    expect(await repos.vehicles.get('v1')).toEqual({
      id: 'v1',
      configId: 'c1',
      year: 2020,
      make: 'Honda',
      model: 'Civic',
      nickname: 'Civic',
      severeDuty: true,
    })
    expect(await repos.vehicles.get('missing')).toBeUndefined()
    expect(await repos.odometer.listForVehicle('v1')).toEqual([
      { vehicleId: 'v1', date: '2026-09-01', miles: 42_000 },
    ])
    expect(await repos.schedule.itemsForConfig('c1')).toEqual([
      {
        id: 'oil',
        configId: 'c1',
        task: 'Oil change',
        kind: 'engine-oil',
        source: 'baseline',
        intervalMiles: 5000,
        intervalMonths: 6,
      },
    ])
  })

  it("reads back custom items, applies them to the car's schedule, and uploads edits as changes", async () => {
    await db.execute(
      "insert into maintenance_items (id, config_id, source, task, interval_miles, interval_months, severe_miles) values ('oil', 'c1', 'baseline', 'Oil change', 10000, 12, 5000)",
    )
    const repos = createPowerSyncRepositories(db)
    const own: CustomItem = {
      id: 'own-oil',
      vehicleId: 'v1',
      replacesItemId: 'oil',
      task: 'Oil change',
      intervalMiles: 5_000,
    }
    const filter: CustomItem = {
      id: 'own-filter',
      vehicleId: 'v1',
      task: 'Cabin air filter',
      intervalMonths: 12,
    }
    const seen = collect<MaintenanceItem[]>((onChange) =>
      repos.schedule.watchForVehicle({ id: 'v1', configId: 'c1' }, onChange),
    )
    await seen.waitFor(1)
    await repos.customItems.save(own)
    await repos.customItems.save(filter)
    expect(await repos.customItems.listForVehicle('v1')).toStrictEqual([filter, own])
    expect(await repos.schedule.itemsForVehicle({ id: 'v1', configId: 'c1' })).toEqual([
      {
        id: 'oil',
        configId: 'c1',
        task: 'Oil change',
        source: 'baseline',
        intervalMiles: 5_000,
        owner: 'changed',
      },
      {
        id: 'own-filter',
        configId: 'c1',
        task: 'Cabin air filter',
        source: 'owner',
        intervalMonths: 12,
        owner: 'added',
      },
    ])
    await seen.waitUntil((items) => items.length === 2)
    seen.stop()

    await repos.customItems.save({ ...own, intervalMiles: 7_500 })
    await repos.customItems.remove('own-filter')
    const ops: [string, Record<string, unknown> | undefined][] = []
    for (let tx = await db.getNextCrudTransaction(); tx; tx = await db.getNextCrudTransaction()) {
      ops.push(
        ...tx.crud
          .filter((c) => c.table === 'custom_items')
          .map((c) => [c.op, c.opData] as [string, Record<string, unknown> | undefined]),
      )
      await tx.complete()
    }
    expect(ops.map(([op]) => op)).toEqual(['PUT', 'PUT', 'PATCH', 'DELETE'])
    expect(Object.keys(ops[2]?.[1] ?? {}).sort()).toEqual(['interval_miles', 'updated_at'])
  })

  it("reads a configuration's recalls, complaint summaries and check times, and follows changes", async () => {
    await db.execute(
      "insert into vehicle_configs (id, make, model, year) values ('c1', 'Toyota', 'RAV4', 2021)",
    )
    const repos = createPowerSyncRepositories(db)
    const reports = collect<SafetyReport>((onChange) => repos.safety.watchForConfig('c1', onChange))
    expect((await reports.waitFor(1))[0]).toEqual({ recalls: [], complaints: [], bulletins: [] })

    await db.writeTransaction(async (tx) => {
      await tx.execute(
        "update vehicle_configs set recalls_checked_at = '2026-10-17 12:00:00Z', complaints_checked_at = '2026-10-17 12:01:00Z', bulletins_checked_at = '2026-10-17 12:02:00Z' where id = 'c1'",
      )
      await tx.execute(
        `insert into recalls (id, config_id, campaign, component, summary, remedy, reported_on, park_it, park_outside, over_the_air)
         values ('r1', 'c1', '23V123000', 'ELECTRICAL SYSTEM', 'Wiring may chafe.', 'Dealers fix it.', '2023-01-26', 0, 1, 0),
                ('r2', 'c9', '23V999000', null, 'Another car', null, null, 0, 0, 0)`,
      )
      await tx.execute(
        `insert into complaint_summaries (id, config_id, component, complaints, crashes, fires, injuries, deaths, latest_filed_on, recent, by_mileage)
         values ('s1', 'c1', 'ENGINE', 4, 1, 1, 2, 0, '2024-03-01', ?, ?)`,
        [
          JSON.stringify([
            { filed_on: '2024-03-01', summary: 'Smoke.' },
            { filed_on: null, summary: 'Leak.' },
            { bad: 1 },
          ]),
          JSON.stringify([
            { from: 90000, complaints: 1 },
            { from: 80000, complaints: 2 },
            { from: 'x', complaints: 1 },
          ]),
        ],
      )
      await tx.execute(
        `insert into bulletins (id, config_id, nhtsa_id, document_id, kind, issued_on, components, system, summary)
         values ('b1', 'c1', 10181234, '19-047', 'warranty', '2019-05-01', '["ENGINE","POWER TRAIN"]', 'Engine / Cooling', 'Water pump coverage.'),
                ('b2', 'c1', 10181235, null, 'mystery', null, 'not json', null, null),
                ('b3', 'c9', 1, null, 'bulletin', null, '[]', null, 'Another car')`,
      )
    })

    // Recalls, complaints, bulletins and check times are watched separately, so the report
    // settles over a few updates.
    const settled = await reports.waitUntil(
      (r) =>
        r.recalls.length > 0 &&
        r.complaints.length > 0 &&
        (r.bulletins?.length ?? 0) === 2 &&
        r.bulletinsCheckedAt !== undefined,
    )
    reports.stop()
    expect(settled).toEqual({
      recallsCheckedAt: '2026-10-17 12:00:00Z',
      complaintsCheckedAt: '2026-10-17 12:01:00Z',
      bulletinsCheckedAt: '2026-10-17 12:02:00Z',
      recalls: [
        {
          id: 'r1',
          configId: 'c1',
          campaign: '23V123000',
          component: 'ELECTRICAL SYSTEM',
          summary: 'Wiring may chafe.',
          remedy: 'Dealers fix it.',
          reportedOn: '2023-01-26',
          parkIt: false,
          parkOutside: true,
          overTheAir: false,
        },
      ],
      complaints: [
        {
          id: 's1',
          configId: 'c1',
          component: 'ENGINE',
          complaints: 4,
          crashes: 1,
          fires: 1,
          injuries: 2,
          deaths: 0,
          latestFiledOn: '2024-03-01',
          recent: [{ filedOn: '2024-03-01', summary: 'Smoke.' }, { summary: 'Leak.' }],
          byMileage: [
            { from: 80000, complaints: 2 },
            { from: 90000, complaints: 1 },
          ],
        },
      ],
      bulletins: [
        {
          id: 'b1',
          configId: 'c1',
          nhtsaId: 10181234,
          documentId: '19-047',
          kind: 'warranty',
          issuedOn: '2019-05-01',
          components: ['ENGINE', 'POWER TRAIN'],
          system: 'Engine / Cooling',
          summary: 'Water pump coverage.',
        },
        { id: 'b2', configId: 'c1', nhtsaId: 10181235, kind: 'other', components: [], summary: '' },
      ],
    })
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
