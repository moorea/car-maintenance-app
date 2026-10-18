import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PowerSyncDatabase } from '@powersync/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CommonPowerSyncDatabase } from '@powersync/common'
import { createAttachmentRepo } from './attachments'
import { createPowerSyncRepositories } from './repositories'
import { schema } from './schema'
import { nodeDeviceFiles } from './testing/nodeDeviceFiles'

// An owner with a fleet and years of history on the phone: enough rows that a query reading
// a whole table, or sorting a car's history without an index, would show in every screen.
const CARS = 12
const YEARS = 15

let dir: string
let db: InstanceType<typeof PowerSyncDatabase>

const day = (year: number, dayOfYear: number) =>
  new Date(Date.UTC(year, 0, 1 + dayOfYear)).toISOString().slice(0, 10)

const seed = async () => {
  const statements: [string, unknown[]][] = []
  for (let car = 0; car < CARS; car++) {
    const vehicleId = `car-${car}`
    statements.push([
      "insert into vehicles (id, owner_id, year, make, model) values (?, 'owner', 2012, 'Honda', 'Civic')",
      [vehicleId],
    ])
    for (let y = 0; y < YEARS; y++) {
      const year = 2012 + y
      for (let week = 0; week < 52; week++) {
        statements.push([
          "insert into fill_ups (id, vehicle_id, filled_on, odometer_miles, energy, quantity, cost_cents, full_tank) values (uuid(), ?, ?, ?, 'gasoline', 11.2, 4200, 1)",
          [vehicleId, day(year, week * 7), (y * 52 + week) * 250],
        ])
      }
      for (let month = 0; month < 12; month++) {
        const on = day(year, month * 30)
        statements.push(
          [
            'insert into service_records (id, vehicle_id, performed_on, odometer_miles, shop, created_at) values (uuid(), ?, ?, ?, ?, ?)',
            [vehicleId, on, (y * 12 + month) * 1100, 'Main St Auto', `${on} 10:00:00`],
          ],
          [
            "insert into odometer_readings (id, vehicle_id, read_on, miles, source) values (uuid(), ?, ?, ?, 'manual')",
            [vehicleId, on, (y * 12 + month) * 1100],
          ],
          [
            "insert into attachments (id, owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on, created_at) values (uuid(), 'owner', ?, 'receipt', 'Receipt.jpg', 'image/jpeg', 1000, ?, ?)",
            [vehicleId, on, `${on} 10:00:00`],
          ],
        )
      }
    }
  }
  await db.writeTransaction(async (tx) => {
    for (const [sql, params] of statements) await tx.execute(sql, params)
  })
}

/** The database the repositories see, recording every query they read with. */
const recording = (inner: CommonPowerSyncDatabase) => {
  const queries = new Set<string>()
  const proxy = new Proxy(inner, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      if (key === 'getAll' || key === 'getOptional' || key === 'get' || key === 'watch')
        return (sql: string, ...rest: unknown[]) => {
          queries.add(sql)
          return (value as (...args: unknown[]) => unknown).call(target, sql, ...rest)
        }
      return (value as (...args: unknown[]) => unknown).bind(target)
    },
  })
  return { db: proxy, queries }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'car-large-'))
  db = new PowerSyncDatabase({ schema, database: { dbFilename: 'large.db', dbLocation: dir } })
  await db.init()
  await seed()
}, 60_000)

afterAll(async () => {
  await db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('years of history on the phone', () => {
  /** Every query the per-car screens and reminders read a car's history with. */
  const historyQueries = async () => {
    const { db: watched, queries } = recording(db)
    const repos = createPowerSyncRepositories(watched)
    const attachments = createAttachmentRepo({
      db: watched,
      files: nodeDeviceFiles(join(dir, 'files')),
      downloadUrl: async () => '',
    })
    const car = 'car-3'
    const read = await Promise.all([
      repos.records.listForVehicle(car),
      repos.odometer.listForVehicle(car),
      repos.fillUps.listForVehicle(car),
      attachments.listForVehicle(car),
    ])
    attachments.dispose()
    return { read, queries: [...queries].filter((sql) => /vehicle_id = \?/.test(sql)) }
  }

  it('reads one car’s full history, newest first where the screens list it so', async () => {
    const [records, readings, fillUps, documents] = (await historyQueries()).read
    expect(records).toHaveLength(YEARS * 12)
    expect(readings).toHaveLength(YEARS * 12)
    expect(fillUps).toHaveLength(YEARS * 52)
    expect(documents).toHaveLength(YEARS * 12)
    expect(records[0]?.performedOn).toBe(day(2012 + YEARS - 1, 330))
    expect(records.at(-1)?.performedOn).toBe(day(2012, 0))
    expect(fillUps[0]?.filledOn).toBe(day(2012 + YEARS - 1, 51 * 7))
    expect(fillUps.at(-1)?.filledOn).toBe(day(2012, 0))
  })

  it('finds a car’s history through an index, already in the order it is shown', async () => {
    const { queries } = await historyQueries()
    expect(queries.length).toBeGreaterThanOrEqual(4)
    for (const sql of queries) {
      const plan = (await db.getAll<{ detail: string }>(`explain query plan ${sql}`, ['car-3']))
        .map((step) => step.detail)
        .join('\n')
      expect(plan, sql).toMatch(/USING INDEX/)
      expect(plan, sql).not.toMatch(/SCAN|TEMP B-TREE/)
    }
  })
})
