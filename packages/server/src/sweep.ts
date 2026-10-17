/**
 * Deletes files in the attachments bucket that no attachment row points at: those of deleted cars
 * and accounts, whose rows cascaded away, and those whose row never reached the server. The
 * `orphaned_files` database function decides which (see its migration); this deletes them
 * through the Storage API, the only way Supabase lets a file be removed. Run on a schedule by
 * .github/workflows/sweep-files.yml.
 */
export interface SweepOptions {
  /** The project URL, such as `https://<project>.supabase.co`. */
  url: string
  /** The service role key: the function and the other owners' folders are closed to anyone else. */
  serviceKey: string
  fetch?: typeof fetch
  /** Files listed and deleted per round; Storage deletes at most 1,000 per request. */
  batchSize?: number
  /** Stops after this many rounds, so a run always ends; the next run carries on. */
  maxRounds?: number
}

export interface SweepResult {
  deleted: number
  /** True when files may remain because the run hit `maxRounds`. */
  more: boolean
}

const BUCKET = 'attachments'

export const sweepOrphanedFiles = async (options: SweepOptions): Promise<SweepResult> => {
  const doFetch = options.fetch ?? fetch
  const base = options.url.replace(/\/+$/, '')
  const batchSize = options.batchSize ?? 1000
  const maxRounds = options.maxRounds ?? 50
  const headers = {
    apikey: options.serviceKey,
    authorization: `Bearer ${options.serviceKey}`,
    'content-type': 'application/json',
  }

  const call = async (what: string, path: string, init: RequestInit): Promise<unknown> => {
    const response = await doFetch(`${base}${path}`, { ...init, headers })
    const text = await response.text()
    if (!response.ok) throw new Error(`${what} failed with HTTP ${response.status}: ${text}`)
    return text ? JSON.parse(text) : null
  }

  let deleted = 0
  for (let round = 0; round < maxRounds; round++) {
    const listed = await call('Listing orphaned files', '/rest/v1/rpc/orphaned_files', {
      method: 'POST',
      body: JSON.stringify({ max_files: batchSize }),
    })
    if (!Array.isArray(listed) || !listed.every((name) => typeof name === 'string'))
      throw new Error(`Listing orphaned files returned ${JSON.stringify(listed)}`)
    if (listed.length === 0) return { deleted, more: false }
    const removed = await call('Deleting files', `/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: listed }),
    })
    const count = Array.isArray(removed) ? removed.length : 0
    // Listed but not deletable: another round would list the same files forever.
    if (count === 0) throw new Error(`Storage deleted none of ${listed.length} orphaned files`)
    deleted += count
    // The rest would head the list on every later run and starve newer orphans, so say so.
    if (count < listed.length)
      throw new Error(`Storage deleted ${count} of ${listed.length} orphaned files`)
    if (listed.length < batchSize) return { deleted, more: false }
  }
  return { deleted, more: true }
}
