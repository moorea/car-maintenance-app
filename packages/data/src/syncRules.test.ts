import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SqlSyncRules } from '@powersync/service-sync-rules'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { schema } from './schema'

const path = fileURLToPath(new URL('../../../powersync/sync-rules.yaml', import.meta.url))
const source = readFileSync(path, 'utf8')

interface Stream {
  auto_subscribe?: boolean
  query?: string
  queries?: string[]
}
const streams = Object.values((parse(source) as { streams: Record<string, Stream> }).streams)
const queries = streams.flatMap((s) => s.queries ?? (s.query ? [s.query] : []))

/**
 * The only query shapes allowed: the user's own vehicles, or rows whose key is in a list drawn
 * from them. Anything else (an OR, a client-supplied parameter) fails, because RLS does not apply
 * to sync and these queries are the read boundary. Widening this needs a deliberate review.
 */
const OWN_VEHICLES = 'vehicles WHERE owner_id = auth\\.user_id\\(\\)'
const SCOPED = [
  new RegExp(`^SELECT \\* FROM (vehicles) WHERE owner_id = auth\\.user_id\\(\\)$`),
  new RegExp(`^SELECT \\* FROM (\\w+) WHERE \\w+ IN \\(SELECT \\w+ FROM ${OWN_VEHICLES}\\)$`),
]
const tableOf = (query: string) => SCOPED.map((re) => re.exec(query)?.[1]).find(Boolean)
const syncedTables = queries.map(tableOf)

describe('sync streams', () => {
  it('parse without errors', () => {
    expect(SqlSyncRules.validate(source, { defaultSchema: 'public' })).toEqual([])
  })

  it('sync exactly the tables in the device schema', () => {
    expect(new Set(syncedTables)).toEqual(
      new Set(schema.tables.filter((t) => !t.localOnly).map((t) => t.name)),
    )
  })

  it('only sync tables that Postgres publishes to PowerSync', () => {
    const migrations = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))
    const sql = readdirSync(migrations)
      .map((f) => readFileSync(migrations + f, 'utf8'))
      .join('\n')
    const tables = (list: string) => list.split(',').map((t) => t.trim().replace(/^public\./, ''))
    const created = /create publication powersync for table([^;]*);/.exec(sql)?.[1] ?? ''
    const added = [...sql.matchAll(/alter publication powersync add table([^;]*);/g)]
    const published = [...tables(created), ...added.flatMap((m) => tables(m[1] ?? ''))]
    expect(new Set(published)).toEqual(new Set(syncedTables))
  })

  it("scope every query to the signed-in user's vehicles", () => {
    for (const query of queries) expect(tableOf(query), query).toBeDefined()
  })

  it('subscribe every stream by default, since the app never subscribes explicitly', () => {
    for (const stream of streams) expect(stream.auto_subscribe).toBe(true)
  })
})
