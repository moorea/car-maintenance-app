import { UpdateType, type CommonPowerSyncDatabase, type CrudEntry } from '@powersync/common'
import type { UploadableTable } from './schema'

/** The writes the uploader needs from the backend. Each resolves with an error instead of throwing. */
export interface CrudBackend {
  /** Inserts the row, or does nothing if a row with its id already exists. */
  insert(table: string, row: Record<string, unknown>): Promise<BackendError | null>
  /** Inserts the row, or replaces the existing row with its id. */
  upsert(table: string, row: Record<string, unknown>): Promise<BackendError | null>
  /** Updates the row; reports an error when no row was updated (missing, or refused by RLS). */
  update(table: string, id: string, changes: Record<string, unknown>): Promise<BackendError | null>
  remove(table: string, id: string): Promise<BackendError | null>
}

/** A failed write. `code` is the SQLSTATE or PostgREST code, `status` the HTTP status. */
export interface BackendError {
  code?: string | undefined
  status?: number | undefined
  message: string
}

/**
 * Errors that will fail the same way on every retry, so retrying would block every later change in
 * the queue forever: bad data (SQLSTATE class 22), constraint violations (class 23), an RLS refusal
 * for a signed-in user (42501), and any other client error. A 401 means the request went out
 * without a valid session, and 408 and 429 are transient, so those are retried with the rest.
 */
export const isPermanent = (error: BackendError): boolean => {
  const { code = '', status = 0 } = error
  if (status === 401 || status === 408 || status === 429) return false
  if (code.startsWith('22') || code.startsWith('23') || code === '42501') return true
  return status >= 400 && status < 500
}

/**
 * What the device may change on the server, per table. Service records and odometer readings are
 * append-only (a correction is a delete plus an insert), so a local update to them is refused here
 * rather than uploaded and silently reverted.
 */
const ALLOWED: Record<UploadableTable, readonly UpdateType[]> = {
  vehicles: [UpdateType.PUT, UpdateType.PATCH, UpdateType.DELETE],
  service_records: [UpdateType.PUT, UpdateType.DELETE],
  odometer_readings: [UpdateType.PUT],
  warranties: [UpdateType.PUT, UpdateType.PATCH, UpdateType.DELETE],
}
const APPEND_ONLY = new Set<string>(['service_records', 'odometer_readings'])

const isUploadable = (table: string): table is UploadableTable => Object.hasOwn(ALLOWED, table)

/**
 * Sends one local change to the backend. Returns the permanent error if the change was dropped,
 * and throws on a temporary one so PowerSync retries the whole transaction later.
 */
export const applyCrud = async (
  backend: CrudBackend,
  entry: CrudEntry,
): Promise<BackendError | null> => {
  if (!isUploadable(entry.table)) return { message: `${entry.table} is read-only on the device` }
  if (!ALLOWED[entry.table].includes(entry.op)) {
    return { message: `${entry.op} is not allowed on ${entry.table}` }
  }
  const data = entry.opData ?? {}
  const row = { ...data, id: entry.id }
  const error =
    entry.op === UpdateType.PUT
      ? // A retried insert must not turn into an update, which append-only tables refuse.
        APPEND_ONLY.has(entry.table)
        ? await backend.insert(entry.table, row)
        : await backend.upsert(entry.table, row)
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
