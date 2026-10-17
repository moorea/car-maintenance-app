import { parseArgs } from 'node:util'
import pg from 'pg'
import { postgresDb } from './db.ts'
import { httpFiles } from './files.ts'
import type { ModelYear } from './parse.ts'
import { runImport, type ImportDb } from './run.ts'
import {
  coversEveryYear,
  DATASETS_PAGE,
  FALLBACK_SOURCES,
  sourcesFromPage,
  type Source,
} from './sources.ts'

/**
 * Imports NHTSA's manufacturer communications and complaint mileages into Supabase. Runs on a
 * schedule in GitHub Actions (.github/workflows/import-nhtsa.yml) with DATABASE_URL and
 * PGPASSWORD set. With --dry-run it touches no database: it reads the files for the
 * --model-year values given (make/model/year) and prints what it found, which CI uses to check
 * that NHTSA's files still parse.
 */
const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'model-year': { type: 'string', multiple: true, default: [] },
  },
})

const log = (message: string) => console.log(message)

const sources = async (): Promise<Source[]> => {
  try {
    const response = await fetch(DATASETS_PAGE)
    const found = response.ok ? sourcesFromPage(await response.text()) : []
    if (coversEveryYear(found, new Date().getUTCFullYear())) return found
    log(
      `${DATASETS_PAGE} (${response.status}) does not list every year's files; using the known ones.`,
    )
  } catch (e) {
    log(`Could not read ${DATASETS_PAGE}: ${String(e)}; using the known ones.`)
  }
  return FALLBACK_SOURCES
}

/** A database that stores nothing and prints what it would have stored. */
const dryRunDb = (modelYears: ModelYear[]): ImportDb => ({
  ownedModelYears: async () => modelYears.map((m) => ({ ...m, waiting: true, bulletins: 0 })),
  importedEtags: async () => new Map(),
  storeBulletins: async (m, rows) => {
    const kinds = Object.entries(
      rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.kind]: (n[r.kind] ?? 0) + 1 }), {}),
    )
    log(
      `${m.year} ${m.make} ${m.model}: ${rows.length} bulletins ${JSON.stringify(Object.fromEntries(kinds))}`,
    )
    for (const r of rows.slice(-3)) log(`  ${JSON.stringify(r).slice(0, 400)}`)
    if (rows.length === 0) throw new Error(`No bulletins found for ${m.year} ${m.make} ${m.model}`)
  },
  storeMiles: async (rows) => {
    log(`${rows.length} complaint mileages, such as ${JSON.stringify(rows.slice(0, 3))}`)
    if (rows.length === 0) throw new Error('No complaint mileages found')
  },
  refreshMileage: async () => {},
  recordImported: async () => {},
  transaction: async (store) => store(),
})

const parseModelYear = (value: string): ModelYear => {
  const [make, model, year] = value.split('/')
  if (!make || !model || !year || !/^\d{4}$/.test(year))
    throw new Error(`--model-year must look like honda/cr-v/2017, not ${value}`)
  return { make: make.toLowerCase(), model: model.toLowerCase(), year: Number(year) }
}

const main = async () => {
  const files = httpFiles()
  if (values['dry-run']) {
    const modelYears = values['model-year'].map(parseModelYear)
    await runImport({ db: dryRunDb(modelYears), files, sources: await sources(), log, force: true })
    return
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL (and PGPASSWORD) to the Supabase database')
  // Supabase's pooler presents a certificate from Supabase's own CA, which Node does not know;
  // the connection is still encrypted. An sslmode in the URL would override this, so it is
  // dropped.
  const connectionString = new URL(url)
  connectionString.searchParams.delete('sslmode')
  const client = new pg.Client({
    connectionString: connectionString.toString(),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const result = await runImport({
      db: postgresDb(client),
      files,
      sources: await sources(),
      log,
      force: values.force,
    })
    log(JSON.stringify(result))
  } finally {
    await client.end()
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
