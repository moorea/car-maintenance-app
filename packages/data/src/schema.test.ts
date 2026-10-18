import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  fromAttachment,
  fromFillUp,
  fromRenewal,
  fromServiceRecord,
  fromVehicle,
  fromWarranty,
} from './rows'
import { schema } from './schema'

const migrations = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))
const sql = readdirSync(migrations)
  .sort()
  .map((f) => readFileSync(migrations + f, 'utf8'))
  .join('\n')

/** Column names of `create table public.x (...)` plus any `alter table public.x add column`. */
const postgresColumns = (table: string): string[] => {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1]
  if (!body) throw new Error(`No create table for ${table}`)
  const added = [...sql.matchAll(new RegExp(`alter table public\\.${table}\\b([^;]*);`, 'g'))]
    .flatMap((m) => [...(m[1] ?? '').matchAll(/add column (\w+)/g)])
    .map((m) => m[1] ?? '')
  const created = body
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0] ?? '')
    .filter(
      (word) =>
        /^[a-z_]+$/.test(word) &&
        !['unique', 'primary', 'check', 'constraint', 'foreign'].includes(word),
    )
  return [...created, ...added]
}

describe('device schema', () => {
  const synced = schema.tables.filter((t) => !t.localOnly)

  it.each(synced.map((t) => [t.name, t] as const))(
    'has the same columns as Postgres for %s',
    (name, table) => {
      const device = ['id', ...table.columns.map((c) => c.name)]
      expect(device.sort()).toEqual(postgresColumns(name).sort())
    },
  )

  it('stores every field the app writes for a new car', () => {
    const columns = synced.find((t) => t.name === 'vehicles')?.columns.map((c) => c.name)
    const car = { id: 'v', year: 2020, make: 'm', model: 'm', nickname: 'n', severeDuty: false }
    expect(['id', ...(columns ?? [])]).toEqual(
      expect.arrayContaining(Object.keys(fromVehicle('u', car))),
    )
  })

  it('stores every field the app writes for a service record', () => {
    const columns = synced.find((t) => t.name === 'service_records')?.columns.map((c) => c.name)
    const written = Object.keys(fromServiceRecord({ id: 'r', vehicleId: 'v', performedOn: 'd' }))
    expect(['id', ...(columns ?? [])]).toEqual(expect.arrayContaining(written))
  })

  it('stores every field the app writes for a warranty', () => {
    const columns = synced.find((t) => t.name === 'warranties')?.columns.map((c) => c.name)
    const written = Object.keys(
      fromWarranty({ id: 'w', vehicleId: 'v', kind: 'basic', startsOn: 'd', months: 36 }),
    )
    expect(['id', ...(columns ?? [])]).toEqual(expect.arrayContaining(written))
  })

  it('stores every field the app writes for a renewal', () => {
    const columns = synced.find((t) => t.name === 'renewals')?.columns.map((c) => c.name)
    const written = Object.keys(
      fromRenewal({ id: 'r', vehicleId: 'v', kind: 'other', title: 't', dueOn: 'd' }),
    )
    expect(['id', ...(columns ?? [])]).toEqual(expect.arrayContaining(written))
  })

  it('stores every field the app writes for a fill-up', () => {
    const columns = synced.find((t) => t.name === 'fill_ups')?.columns.map((c) => c.name)
    const written = Object.keys(
      fromFillUp({
        id: 'f',
        vehicleId: 'v',
        filledOn: 'd',
        odometerMiles: 1,
        energy: 'fuel',
        quantity: 1,
        full: true,
        missedPrevious: false,
      }),
    )
    expect(['id', ...(columns ?? [])]).toEqual(expect.arrayContaining(written))
  })

  it('stores every field the app writes for an attachment', () => {
    const columns = synced.find((t) => t.name === 'attachments')?.columns.map((c) => c.name)
    const written = Object.keys(
      fromAttachment('u', {
        id: 'a',
        vehicleId: 'v',
        kind: 'receipt',
        name: 'n',
        contentType: 'image/jpeg',
        sizeBytes: 1,
        addedOn: 'd',
      }),
    )
    expect(['id', ...(columns ?? [])]).toEqual(expect.arrayContaining(written))
  })
})
