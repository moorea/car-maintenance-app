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
  /** Stores a file in the attachments bucket. A file already at `path` counts as stored. */
  putFile(path: string, bytes: Uint8Array, contentType: string): Promise<BackendError | null>
  /** Deletes a file from the attachments bucket. A missing file counts as deleted. */
  removeFile(path: string): Promise<BackendError | null>
}

/** What an upload needs from the phone besides the queued change. */
export interface UploadContext {
  /** The signed-in user the upload runs as. */
  userId: string
  /** The bytes of an attachment's file on this phone, or undefined if there is no local copy. */
  readFile(attachmentId: string): Promise<Uint8Array | undefined>
}

/** Where an attachment's file lives in Storage: its owner's folder, so RLS can scope it. */
export const attachmentPath = (ownerId: string, attachmentId: string) =>
  `${ownerId}/${attachmentId}`

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
  fill_ups: [UpdateType.PUT, UpdateType.PATCH, UpdateType.DELETE],
  tire_sets: [UpdateType.PUT, UpdateType.PATCH, UpdateType.DELETE],
  renewals: [UpdateType.PUT, UpdateType.PATCH, UpdateType.DELETE],
  attachments: [UpdateType.PUT, UpdateType.DELETE],
}
const APPEND_ONLY = new Set<string>(['service_records', 'odometer_readings', 'attachments'])

const isUploadable = (table: string): table is UploadableTable => Object.hasOwn(ALLOWED, table)

/** A foreign key to a missing row, or the RLS check that a service belongs to the same car. */
const isMissingParent = (error: BackendError) => error.code === '23503' || error.code === '42501'

/** Returns a permanent error to drop the change with, or throws a temporary one for a retry. */
const settle = (table: string, error: BackendError | null): BackendError | null => {
  if (!error || isPermanent(error)) return error
  throw new Error(`Upload to ${table} failed: ${error.message}`, { cause: error })
}

/**
 * An attachment's file goes to Storage before its row goes to Postgres, so the server never has
 * a row without a file, and a retry or a sign-out waiting for uploads covers the file too. On
 * delete the row goes first, so the file is never missing while its row is still synced.
 */
const applyAttachment = async (
  backend: CrudBackend,
  entry: CrudEntry,
  row: Record<string, unknown>,
  context: UploadContext,
): Promise<BackendError | null> => {
  if (entry.op === UpdateType.DELETE) {
    const dropped = settle(entry.table, await backend.remove(entry.table, entry.id))
    if (dropped) return dropped
    // RLS only lets the owner delete, so the file is in the signed-in user's folder.
    return settle('storage', await backend.removeFile(attachmentPath(context.userId, entry.id)))
  }
  const bytes = await context.readFile(entry.id)
  // A row whose file never made it to Storage could never be opened on another phone.
  if (!bytes) return { message: `The file for attachment ${entry.id} is not on this phone` }
  const ownerId = typeof row.owner_id === 'string' ? row.owner_id : context.userId
  const path = attachmentPath(ownerId, entry.id)
  const contentType = typeof row.content_type === 'string' ? row.content_type : ''
  const dropped = settle('storage', await backend.putFile(path, bytes, contentType))
  if (dropped) return dropped
  let refused = settle(entry.table, await backend.insert(entry.table, row))
  // Its service was deleted on another phone before this upload: keep the receipt with the car.
  if (refused && row.service_record_id != null && isMissingParent(refused)) {
    refused = settle(
      entry.table,
      await backend.insert(entry.table, { ...row, service_record_id: null }),
    )
  }
  // Best effort: the row will never arrive, so its file would only take up the owner's space.
  if (refused) await backend.removeFile(path).catch(() => null)
  return refused
}

/**
 * Sends one local change to the backend. Returns the permanent error if the change was dropped,
 * and throws on a temporary one so PowerSync retries the whole transaction later.
 */
export const applyCrud = async (
  backend: CrudBackend,
  entry: CrudEntry,
  context: UploadContext,
): Promise<BackendError | null> => {
  if (!isUploadable(entry.table)) return { message: `${entry.table} is read-only on the device` }
  if (!ALLOWED[entry.table].includes(entry.op)) {
    return { message: `${entry.op} is not allowed on ${entry.table}` }
  }
  const data = entry.opData ?? {}
  const row: Record<string, unknown> = { ...data, id: entry.id }
  if (entry.table === 'attachments') return applyAttachment(backend, entry, row, context)
  if (entry.table === 'service_records' && entry.op === UpdateType.PUT) {
    const error = await backend.insert(entry.table, row)
    // A schedule item the server no longer has, or never had (an imported service): keep the
    // service without the link rather than drop it.
    if (error?.code === '23503' && row.item_id != null)
      return settle(entry.table, await backend.insert(entry.table, { ...row, item_id: null }))
    return settle(entry.table, error)
  }
  const error =
    entry.op === UpdateType.PUT
      ? // A retried insert must not turn into an update, which append-only tables refuse.
        APPEND_ONLY.has(entry.table)
        ? await backend.insert(entry.table, row)
        : await backend.upsert(entry.table, row)
      : entry.op === UpdateType.PATCH
        ? await backend.update(entry.table, entry.id, data)
        : await backend.remove(entry.table, entry.id)
  return settle(entry.table, error)
}

/** Uploads every pending local transaction, oldest first. */
export const uploadPending = async (
  db: Pick<CommonPowerSyncDatabase, 'getNextCrudTransaction'>,
  backend: CrudBackend,
  onDropped: (entry: CrudEntry, error: BackendError) => void,
  context: UploadContext,
): Promise<void> => {
  for (;;) {
    const transaction = await db.getNextCrudTransaction()
    if (!transaction) return
    for (const entry of transaction.crud) {
      const dropped = await applyCrud(backend, entry, context)
      if (dropped) onDropped(entry, dropped)
    }
    await transaction.complete()
  }
}
