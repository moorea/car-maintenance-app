import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseStorage, transferTimeoutMs, type StorageOptions } from './storage'
import { uploadPending, type BackendError, type CrudBackend } from './upload'

interface PostgrestResult {
  error: { code?: string; message: string } | null
  status: number
}
const toError = ({ error, status }: PostgrestResult): BackendError | null =>
  error ? { code: error.code, status, message: error.message } : null

/**
 * How long one write to PostgREST may take: 30 seconds, plus 10 a megabyte of rows sent.
 * PowerSync waits for an upload to finish before it starts another, so a request stuck on a dead
 * connection (a captive portal, a train going into a tunnel) would hold every later change until
 * the app restarts. Past this, the write fails as a network error and is retried.
 */
export const writeTimeoutMs = (bytes: number) => 30_000 + Math.ceil(bytes / 1_000_000) * 10_000

/** Runs a request with a signal that aborts it after `ms`, and clears the timer either way. */
export const withDeadline = async <T>(
  ms: number,
  send: (signal: AbortSignal) => PromiseLike<T>,
) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`No response in ${ms / 1000}s`)), ms)
  try {
    return await send(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Writes local changes through PostgREST, and attachment files to Storage, as the user who owns
 * `accessToken`, so row-level security applies to every upload. The token is fixed for the whole
 * upload: if the user signs out or switches account midway, supabase-js would otherwise send the
 * rest as someone else.
 */
export const supabaseBackend = (
  supabase: SupabaseClient,
  storage: StorageOptions,
  accessToken: string,
  /**
   * How many times the usual deadlines a request gets. Grows after uploads time out, so a slow
   * connection is given longer rather than cut off at the same point on every retry.
   */
  patience = 1,
  timeoutMs: (bytes: number) => number = writeTimeoutMs,
): CrudBackend => {
  const auth = `Bearer ${accessToken}`
  const from = (table: string) => supabase.from(table)
  const deadline = (body: unknown) =>
    patience * timeoutMs(body === undefined ? 0 : JSON.stringify(body).length)
  // An aborted request resolves with status 0, like any network failure, so it is retried.
  const write = async (
    body: unknown,
    request: (signal: AbortSignal) => PromiseLike<PostgrestResult>,
  ): Promise<BackendError | null> => toError(await withDeadline(deadline(body), request))
  const files = supabaseStorage(
    {
      ...storage,
      timeoutMs: (bytes) => patience * (storage.timeoutMs ?? transferTimeoutMs)(bytes),
    },
    accessToken,
  )
  const insertRows = (table: string, rows: Record<string, unknown> | Record<string, unknown>[]) =>
    write(rows, (signal) =>
      from(table)
        .upsert(rows, { ignoreDuplicates: true })
        .setHeader('Authorization', auth)
        .abortSignal(signal),
    )
  const upsertRows = (table: string, rows: Record<string, unknown> | Record<string, unknown>[]) =>
    write(rows, (signal) =>
      from(table).upsert(rows).setHeader('Authorization', auth).abortSignal(signal),
    )
  return {
    putFile: (path, bytes, contentType) => files.put(path, bytes, contentType),
    removeFile: (path) => files.remove(path),
    insert: insertRows,
    insertMany: insertRows,
    upsert: upsertRows,
    upsertMany: upsertRows,
    update: async (table, id, changes) => {
      // RLS filters a refused update down to zero rows without an error, so count them.
      const result = await withDeadline(deadline(changes), (signal) =>
        from(table)
          .update(changes)
          .eq('id', id)
          .select('id')
          .setHeader('Authorization', auth)
          .abortSignal(signal),
      )
      if (result.error || (result.data?.length ?? 0) > 0) return toError(result)
      return { status: 404, message: `No ${table} row ${id} could be updated` }
    },
    remove: (table, id) =>
      write(undefined, (signal) =>
        from(table).delete().eq('id', id).setHeader('Authorization', auth).abortSignal(signal),
      ),
  }
}

const MAX_PATIENCE_DOUBLINGS = 4

/** The slice of the Supabase client the connector uses. */
export type SupabaseAuth = Pick<SupabaseClient['auth'], 'getSession'>

export interface SupabaseConnectorOptions {
  auth: SupabaseAuth
  /**
   * The backend that uploads as the owner of an access token, giving each request `patience`
   * times its usual deadline.
   */
  backendFor: (accessToken: string, patience: number) => CrudBackend
  powerSyncUrl: string
  /** The bytes of an attachment's file on this phone, or undefined if there is none. */
  readFile: (attachmentId: string) => Promise<Uint8Array | undefined>
  onDropped?: (message: string) => void
}

export interface SupabaseClientConnectorOptions {
  powerSyncUrl: string
  /** The project URL and anon key the client was created with, for Storage uploads. */
  storage: StorageOptions
  readFile: (attachmentId: string) => Promise<Uint8Array | undefined>
  onDropped?: (message: string) => void
}

/**
 * Connects PowerSync to Supabase: the signed-in user's Supabase token authenticates the sync
 * stream, and local changes are uploaded as that user.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  private readonly onDropped: (message: string) => void
  /** Upload passes that failed in a row since the last one that finished. */
  private failedPasses = 0

  constructor(private readonly options: SupabaseConnectorOptions) {
    this.onDropped = options.onDropped ?? console.warn
  }

  static forClient(supabase: SupabaseClient, options: SupabaseClientConnectorOptions) {
    return new SupabaseConnector({
      auth: supabase.auth,
      backendFor: (token, patience) => supabaseBackend(supabase, options.storage, token, patience),
      powerSyncUrl: options.powerSyncUrl,
      readFile: options.readFile,
      ...(options.onDropped ? { onDropped: options.onDropped } : {}),
    })
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.options.auth.getSession()
    if (error) throw error
    const session = data.session
    if (!session) return null
    return {
      endpoint: this.options.powerSyncUrl,
      token: session.access_token,
      ...(session.expires_at ? { expiresAt: new Date(session.expires_at * 1000) } : {}),
    }
  }

  async uploadData(db: CommonPowerSyncDatabase): Promise<void> {
    // Without a session every write would be refused by RLS and dropped. Throwing keeps the queue
    // intact until the user is signed in again. An expired token midway gets a 401, which retries.
    const { data } = await this.options.auth.getSession()
    if (!data.session) throw new Error('Not signed in; uploads wait until a session is restored')
    // Each failed pass doubles the deadlines, up to 16 times: a connection too slow for a file
    // in the usual time still gets it through, while a dead one is retried soon at first.
    const patience = 2 ** Math.min(this.failedPasses, MAX_PATIENCE_DOUBLINGS)
    const backend = this.options.backendFor(data.session.access_token, patience)
    try {
      await uploadPending(
        db,
        backend,
        (entry, error) =>
          this.onDropped(`Dropped ${entry.op} on ${entry.table} ${entry.id}: ${error.message}`),
        { userId: data.session.user.id, readFile: this.options.readFile },
      )
    } catch (error) {
      this.failedPasses++
      throw error
    }
    this.failedPasses = 0
  }
}
