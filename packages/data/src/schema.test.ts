import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fromServiceRecord } from './rows'
import { schema } from './schema'

const migrations = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))
const sql = readdirSync(migrations)
  .sort()
  .map((f) => readFileSync(migrations + f, 'utf8'))
  .join('\n')

/** Column names of each `create table public.x (...)` in the migrations. */
const postgresColumns = (table: string): string[] => {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1]
  if (!body) throw new Error(`No create table for ${table}`)
  return body
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0] ?? '')
    .filter(
      (word) =>
        /^[a-z_]+$/.test(word) &&
        !['unique', 'primary', 'check', 'constraint', 'foreign'].includes(word),
    )
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

  it('stores every field the app writes for a service record', () => {
    const columns = synced.find((t) => t.name === 'service_records')?.columns.map((c) => c.name)
    const written = Object.keys(fromServiceRecord({ id: 'r', vehicleId: 'v', performedOn: 'd' }))
    expect(['id', ...(columns ?? [])]).toEqual(expect.arrayContaining(written))
  })
})
