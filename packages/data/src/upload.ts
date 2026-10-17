import { UpdateType, type CommonPowerSyncDatabase, type CrudEntry } from '@powersync/common'
import { UPLOADABLE_TABLES } from './schema'

/** The writes the uploader needs from the backend. Each resolves with an error instead of throwing. */
export interface CrudBackend {
  upsert(table: string, row: Record<string, unknown>): Promise<BackendError | null>
  update(table: string, id: string, changes: Record<string, unknown>): Promise<BackendError | null>
  remove(table: string, id: string): Promise<BackendError | null>
}

/** A Postgres error as PostgREST reports it; `code` is the SQLSTATE. */
export interface BackendError {
  code?: string | undefined
  message: string
}

/**
 * Errors that will fail the same way on every retry: bad data (class 22), constraint violations
 * (class 23) and row-level security refusals (42501). Retrying these would block every later
 * change in the queue forever, so the change is dropped instead.
 */
export const isPermanent = (error: BackendError): boolean =>
  error.code !== undefined &&
  (error.code.startsWith('22') || error.code.startsWith('23') || error.code === '42501')

const uploadable = new Set<string>(UPLOADABLE_TABLES)

/**
 * Sends one local change to the backend. Returns the permanent error if the change was dropped,
 * and throws on a temporary one so PowerSync retries the whole transaction later.
 */
export const applyCrud = async (
  backend: CrudBackend,
  entry: CrudEntry,
): Promise<BackendError | null> => {
  if (!uploadable.has(entry.table)) {
    return { message: `${entry.table} is read-only on the device` }
  }
  const data = entry.opData ?? {}
  const error =
    entry.op === UpdateType.PUT
      ? await backend.upsert(entry.table, { ...data, id: entry.id })
      : entry.op === UpdateType.PATCH
        ? await backend.update(entry.table, entry.id, data)
        : await backend.remove(entry.table, entry.id)
  if (!error) return null
  if (isPermanent(error)) return error
  throw new Error(`Upload to ${entry.table} failed: ${error.message}`, { cause: error })
}

/** Uploads every pending local transaction, oldest first. */
export const uploadPending = async (
  db: Pick<CommonPowerSyncDatabase, 'getNextCrudTransaction'>,
  backend: CrudBackend,
  onDropped: (entry: CrudEntry, error: BackendError) => void,
): Promise<void> => {
  for (;;) {
    const transaction = await db.getNextCrudTransaction()
    if (!transaction) return
    for (const entry of transaction.crud) {
      const dropped = await applyCrud(backend, entry)
      if (dropped) onDropped(entry, dropped)
    }
    await transaction.complete()
  }
}
