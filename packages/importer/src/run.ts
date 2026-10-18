import {
  bulletinCollector,
  milesCollector,
  modelYearKey,
  type BulletinRow,
  type MilesRow,
  type ModelYear,
  type Stats,
} from './parse.ts'
import { sourcesFor, type Source } from './sources.ts'

/** What the import needs from the database. The real one calls the migration's functions. */
export interface ImportDb {
  /**
   * Owned model years, whether any of their configs still waits for its first bulletins, and how
   * many bulletins are stored for them.
   */
  ownedModelYears(): Promise<(ModelYear & { waiting: boolean; bulletins: number })[]>
  /** The ETag each file had when it was last imported. */
  importedEtags(): Promise<Map<string, string>>
  /** Replaces one model year's bulletins with `rows`. */
  storeBulletins(modelYear: ModelYear, rows: BulletinRow[]): Promise<void>
  storeMiles(rows: MilesRow[]): Promise<void>
  /** Recomputes every owned config's complaint counts by mileage. */
  refreshMileage(): Promise<void>
  recordImported(etags: Map<string, string>): Promise<void>
  /** Runs `store` in one transaction, so a failure part way stores nothing. */
  transaction(store: () => Promise<void>): Promise<void>
}

/** NHTSA's files. */
export interface Files {
  /** The file's current ETag, or undefined when the server sends none. */
  etag(url: string): Promise<string | undefined>
  /** The lines of the file's text inside its zip. Throws if the download fails. */
  lines(url: string): AsyncIterable<string>
}

export type ImportResult =
  | { status: 'nothing-owned' | 'up-to-date' }
  | { status: 'imported'; modelYears: number; bulletins: number; miles: number }

/** Mileages are stored this many at a time, to keep each statement small. */
export const MILES_BATCH = 5_000

/**
 * More malformed lines than this share of a kind's lines means NHTSA changed the layout: the
 * import stops rather than replace every model year's bulletins with what it misread.
 */
export const MAX_MALFORMED_SHARE = 0.05

/**
 * A model year whose stored bulletins would shrink below this share stops the import unless it
 * is forced: NHTSA does not withdraw bulletins in bulk, so it means the files were misread.
 */
export const MIN_KEPT_SHARE = 0.5

const check = (kind: string, stats: Stats) => {
  if (stats.lines === 0) throw new Error(`NHTSA's ${kind} files had no lines`)
  if (stats.malformed / stats.lines > MAX_MALFORMED_SHARE)
    throw new Error(
      `${stats.malformed} of ${stats.lines} lines in NHTSA's ${kind} files are malformed; has the layout changed? The first had ${stats.example ?? 'no example'}`,
    )
}

/**
 * Imports manufacturer bulletins and complaint mileages for every owned model year. Does nothing
 * when no file changed and no model year is waiting, unless `force`. Every file is read before
 * anything is stored, so a failed download changes nothing.
 */
export const runImport = async (options: {
  db: ImportDb
  files: Files
  sources: Source[]
  log: (message: string) => void
  force?: boolean
}): Promise<ImportResult> => {
  const { db, files, log } = options
  const owned = await db.ownedModelYears()
  if (owned.length === 0) {
    log('Nobody owns a car yet.')
    return { status: 'nothing-owned' }
  }
  const sources = sourcesFor(
    options.sources,
    owned.map((o) => o.year),
  )
  const etags = new Map(
    await Promise.all(sources.map(async (s) => [s.url, await files.etag(s.url)] as const)),
  )
  const known = await db.importedEtags()
  const changed = sources.filter((s) => {
    const etag = etags.get(s.url)
    return etag === undefined || etag !== known.get(s.url)
  })
  const waiting = owned.filter((o) => o.waiting)
  if (!options.force && changed.length === 0 && waiting.length === 0) {
    log(`Up to date: ${owned.length} model years, ${sources.length} files unchanged.`)
    return { status: 'up-to-date' }
  }
  log(
    `Importing ${owned.length} model years (${waiting.length} new) from ${sources.length} files (${changed.length} changed).`,
  )

  const wanted = new Set(owned.map(modelYearKey))
  const bulletins = bulletinCollector(wanted)
  const miles = milesCollector(wanted)
  for (const source of sources) {
    const collector = source.kind === 'bulletins' ? bulletins : miles
    const before = collector.stats.lines
    for await (const line of files.lines(source.url)) collector.add(line)
    log(`Read ${(collector.stats.lines - before).toLocaleString('en-US')} lines from ${source.url}`)
  }
  check('manufacturer communications', bulletins.stats)
  check('complaints', miles.stats)

  const planned = owned.map((o) => ({
    modelYear: { make: o.make, model: o.model, year: o.year },
    before: o.bulletins,
    rows: bulletins.rowsFor(o),
  }))
  const shrunk = planned.filter((p) => p.rows.length < p.before * MIN_KEPT_SHARE)
  const [first] = shrunk
  if (first && !options.force) {
    const { year, make, model } = first.modelYear
    throw new Error(
      `${shrunk.length} model years would lose most of their bulletins, such as ${year} ${make} ${model} (${first.before} to ${first.rows.length}); has the layout changed? Run with --force if NHTSA really withdrew them.`,
    )
  }
  const storedBulletins = planned.reduce((n, p) => n + p.rows.length, 0)
  const mileRows = miles.rows()
  const imported = new Map(
    [...etags].flatMap(([url, etag]) => (etag === undefined ? [] : [[url, etag] as const])),
  )
  await db.transaction(async () => {
    for (const { modelYear, rows } of planned) await db.storeBulletins(modelYear, rows)
    for (let i = 0; i < mileRows.length; i += MILES_BATCH)
      await db.storeMiles(mileRows.slice(i, i + MILES_BATCH))
    await db.refreshMileage()
    await db.recordImported(imported)
  })
  log(`Stored ${storedBulletins} bulletins and ${mileRows.length} complaint mileages.`)
  return {
    status: 'imported',
    modelYears: owned.length,
    bulletins: storedBulletins,
    miles: mileRows.length,
  }
}
