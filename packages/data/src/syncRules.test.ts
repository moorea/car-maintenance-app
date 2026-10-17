import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SqlSyncRules } from '@powersync/service-sync-rules'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { schema } from './schema'

const path = fileURLToPath(new URL('../../../powersync/sync-rules.yaml', import.meta.url))
const source = readFileSync(path, 'utf8')

interface Bucket {
  parameters: string
  data: string[]
}
const buckets = Object.values(
  (parse(source) as { bucket_definitions: Record<string, Bucket> }).bucket_definitions,
)

describe('sync rules', () => {
  it('parse without errors', () => {
    expect(SqlSyncRules.validate(source, { defaultSchema: 'public' })).toEqual([])
  })

  it('sync exactly the tables in the device schema', () => {
    const synced = buckets.flatMap((b) => b.data.map((q) => /\bfrom\s+(\w+)/i.exec(q)?.[1]))
    expect(new Set(synced)).toEqual(
      new Set(schema.tables.filter((t) => !t.localOnly).map((t) => t.name)),
    )
  })

  it('scope every bucket to the signed-in user', () => {
    for (const bucket of buckets) expect(bucket.parameters).toContain('request.user_id()')
  })
})
