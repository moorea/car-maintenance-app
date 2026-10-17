import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SqlSyncRules } from '@powersync/service-sync-rules'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { schema } from './schema'

const path = fileURLToPath(new URL('../../../powersync/sync-rules.yaml', import.meta.url))
const source = readFileSync(path, 'utf8')

interface Stream {
  query?: string
  queries?: string[]
}
const streams = Object.values((parse(source) as { streams: Record<string, Stream> }).streams)
const queries = streams.flatMap((s) => s.queries ?? (s.query ? [s.query] : []))
const syncedTables = queries.map((q) => /^select\s.+?\sfrom\s+(\w+)/i.exec(q)?.[1])

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
    const list = /create publication powersync for table([^;]*);/.exec(sql)?.[1] ?? ''
    const published = list.split(',').map((t) => t.trim().replace(/^public\./, ''))
    expect(new Set(published)).toEqual(new Set(syncedTables))
  })

  it("scope every query to the signed-in user's vehicles", () => {
    for (const query of queries) expect(query).toContain('owner_id = auth.user_id()')
  })
})
