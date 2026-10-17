import {
  AssistantError,
  quoteLinesSchema,
  type AssistantErrorKind,
  type QuoteReader,
} from '@car/core'

export interface RemoteQuoteReaderOptions {
  /** The read-quote endpoint, such as `https://<project>.supabase.co/functions/v1/assistant/read-quote`. */
  url: string
  /** The signed-in owner's access token, or undefined when signed out. */
  accessToken: () => Promise<string | undefined>
  fetch: typeof fetch
}

const KINDS: AssistantErrorKind[] = [
  'offline',
  'signed-out',
  'not-found',
  'rate-limited',
  'unavailable',
  'declined',
  'unknown',
]

const kindForStatus = (status: number): AssistantErrorKind => {
  if (status === 401) return 'signed-out'
  if (status === 422) return 'declined'
  if (status === 429) return 'rate-limited'
  if (status === 503) return 'unavailable'
  return 'unknown'
}

/** The assistant edge function's read-quote endpoint. The photo is sent, read and not kept. */
export const remoteQuoteReader = (options: RemoteQuoteReaderOptions): QuoteReader => ({
  read: async (photo, signal) => {
    const token = await options.accessToken()
    if (!token) throw new AssistantError('signed-out')

    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort)
    if (signal?.aborted) abort()
    try {
      let response: Response
      try {
        response = await options.fetch(options.url, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ photo }),
          signal: controller.signal,
        })
      } catch (error) {
        throw new AssistantError('offline', String(error))
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          { error?: unknown } | undefined
        const kind = KINDS.find((k) => k === body?.error)
        throw new AssistantError(kind && kind !== 'unknown' ? kind : kindForStatus(response.status))
      }
      const body = (await response.json().catch(() => undefined)) as { lines?: unknown } | undefined
      const lines = quoteLinesSchema.safeParse(body?.lines)
      if (!lines.success) throw new AssistantError('unknown', 'Unexpected response')
      return lines.data
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  },
})
