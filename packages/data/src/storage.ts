import { AttachmentError } from '@car/core'
import type { BackendError } from './upload'

/** The Supabase project whose Storage holds attachment files. */
export interface StorageOptions {
  /** The project URL, such as `https://<project>.supabase.co`. */
  url: string
  /** The project's anon (publishable) key, sent as `apikey` like supabase-js does. */
  anonKey: string
  fetch?: typeof fetch
  /**
   * How long a request may take before it is abandoned and retried, given the bytes it sends.
   * Defaults to `transferTimeoutMs`.
   */
  timeoutMs?: (bytes: number) => number
}

/**
 * Time for a request to Storage: 30 seconds, plus 10 seconds a megabyte sent, so a 25 MB scan
 * still uploads at about 0.7 Mbit/s, while a request on a dead connection is given up and retried
 * rather than holding every later upload behind it.
 */
export const transferTimeoutMs = (bytes: number) => 30_000 + Math.ceil(bytes / 1_000_000) * 10_000

const BUCKET = 'attachments'

/** Files in the attachments bucket, read and written as the owner of one access token. */
export interface AttachmentStorage {
  /** Stores a file. A file already at `path` counts as stored, so a retried upload succeeds. */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<BackendError | null>
  /** Deletes a file. A missing file counts as deleted. */
  remove(path: string): Promise<BackendError | null>
  /** A URL anyone holding it can download the file from for `expiresIn` seconds. */
  signedUrl(path: string, expiresIn: number): Promise<{ url: string } | BackendError>
}

interface StorageErrorBody {
  statusCode?: unknown
  code?: unknown
  error?: unknown
  message?: unknown
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * Storage API errors arrive as HTTP 400 with the real status in the body's `statusCode`
 * (`"409"` for a duplicate, `"404"` for a missing object, `"403"` for an RLS refusal), so the
 * body's status wins. Checked against storage-api in Supabase CLI 2.121.0. An invalid or expired token is reported as 401 so the upload is retried
 * once the session refreshes rather than dropped.
 */
const toStorageError = async (response: Response): Promise<BackendError> => {
  let body: StorageErrorBody = {}
  try {
    body = (await response.json()) as StorageErrorBody
  } catch {
    // Not JSON; the HTTP status is all there is.
  }
  const code = str(body.code) ?? str(body.error)
  const message = str(body.message) ?? str(body.error) ?? `HTTP ${response.status}`
  const reported = Number(str(body.statusCode) ?? body.statusCode)
  // Storage reports these as 403 AccessDenied, like an RLS refusal, so the message tells them apart.
  const invalidToken =
    code === 'InvalidJWT' || /jwt expired|"exp" claim|signature verification failed/i.test(message)
  const status = invalidToken
    ? 401
    : Number.isInteger(reported) && reported >= 400 && reported < 600
      ? reported
      : response.status
  return { status, message, ...(code ? { code } : {}) }
}

const isDuplicate = (error: BackendError) =>
  error.status === 409 ||
  error.code === 'Duplicate' ||
  error.code === 'KeyAlreadyExists' ||
  /already exists/i.test(error.message)

const isNotFound = (error: BackendError) =>
  error.status === 404 || error.code === 'NoSuchKey' || /not found/i.test(error.message)

/**
 * Talks to the Storage REST API with a fixed access token, like the PostgREST uploads in
 * connector.ts: supabase-js's storage client would send whatever session is current, so a
 * sign-out or account switch midway through an upload would send the rest as someone else.
 */
export const supabaseStorage = (
  options: StorageOptions,
  accessToken: string,
): AttachmentStorage => {
  const doFetch = options.fetch ?? fetch
  const base = `${options.url.replace(/\/+$/, '')}/storage/v1`
  const headers = { authorization: `Bearer ${accessToken}`, apikey: options.anonKey }

  const timeoutMs = options.timeoutMs ?? transferTimeoutMs

  const send = async (
    url: string,
    init: RequestInit & { bytes?: number },
  ): Promise<{ response: Response } | { error: BackendError }> => {
    const { bytes = 0, ...request } = init
    const controller = new AbortController()
    const ms = timeoutMs(bytes)
    const timer = setTimeout(() => controller.abort(new Error(`No response in ${ms / 1000}s`)), ms)
    try {
      const response = await doFetch(url, {
        ...request,
        headers: { ...headers, ...request.headers },
        signal: controller.signal,
      })
      return response.ok ? { response } : { error: await toStorageError(response) }
    } catch (error) {
      // No connection, or no response in time: status 0 is retried.
      return { error: { status: 0, message: String(error) } }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    put: async (path, bytes, contentType) => {
      const result = await send(`${base}/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { 'content-type': contentType, 'x-upsert': 'false' },
        body: bytes as Uint8Array<ArrayBuffer>,
        bytes: bytes.byteLength,
      })
      if ('response' in result) return null
      return isDuplicate(result.error) ? null : result.error
    },

    remove: async (path) => {
      const result = await send(`${base}/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      })
      if ('response' in result) return null
      return isNotFound(result.error) ? null : result.error
    },

    signedUrl: async (path, expiresIn) => {
      const result = await send(`${base}/object/sign/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      })
      if ('error' in result) return result.error
      let signed: string | undefined
      try {
        signed = str(((await result.response.json()) as { signedURL?: unknown }).signedURL)
      } catch {
        // Handled below.
      }
      if (!signed) return { status: result.response.status, message: 'No signed URL returned' }
      // signedURL is relative to the Storage API, such as `/object/sign/attachments/...?token=`.
      return { url: encodeURI(`${base}${signed}`) }
    },
  }
}

export interface DownloadUrlOptions extends StorageOptions {
  /** The signed-in owner's current access token, or undefined when signed out. */
  accessToken: () => Promise<string | undefined>
  /** How long a download link works, in seconds. Ten minutes by default. */
  expiresIn?: number
}

/**
 * Gives a short-lived download URL for an attachment's file, rejecting with AttachmentError:
 * `offline` without a connection, `not-uploaded` when the phone that attached it has not
 * uploaded the file yet, and `unknown` otherwise.
 */
export const attachmentDownloadUrl =
  (options: DownloadUrlOptions) =>
  async (path: string): Promise<string> => {
    const token = await options.accessToken()
    if (!token) throw new AttachmentError('unknown', 'Not signed in')
    const result = await supabaseStorage(options, token).signedUrl(path, options.expiresIn ?? 600)
    if ('url' in result) return result.url
    if (result.status === 0) throw new AttachmentError('offline', result.message)
    if (isNotFound(result)) throw new AttachmentError('not-uploaded', result.message)
    throw new AttachmentError('unknown', result.message)
  }
