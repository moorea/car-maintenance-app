import {
  AssistantError,
  type AnswerEvent,
  type Assistant,
  type AssistantErrorKind,
} from '@car/core'

export interface RemoteAssistantOptions {
  /** The assistant edge function, such as `https://<project>.supabase.co/functions/v1/assistant`. */
  url: string
  /** The signed-in owner's access token, or undefined when signed out. */
  accessToken: () => Promise<string | undefined>
  /** A fetch whose responses stream their body; React Native's built-in fetch does not. */
  fetch: typeof fetch
}

type ServerEvent = AnswerEvent | { type: 'done' } | { type: 'error'; kind: AssistantErrorKind }

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
  if (status === 404) return 'not-found'
  if (status === 429) return 'rate-limited'
  if (status === 503 || status >= 500) return 'unavailable'
  return 'unknown'
}

/**
 * Reads a server-sent event stream, passing the JSON of each event's `data:` lines to `onData`
 * until it returns true or the stream ends. A plain loop rather than an async generator, which
 * Hermes cannot run.
 */
const readServerEvents = async (
  body: ReadableStream<Uint8Array>,
  onData: (data: unknown) => boolean,
): Promise<void> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let end = buffer.indexOf('\n\n')
      while (end !== -1) {
        const data = buffer
          .slice(0, end)
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        buffer = buffer.slice(end + 2)
        if (data && onData(JSON.parse(data))) return
        end = buffer.indexOf('\n\n')
      }
      if (done) return
    }
  } finally {
    void reader.cancel().catch(() => {})
  }
}

const isAnswerEvent = (e: ServerEvent): e is AnswerEvent =>
  e.type === 'conversation' || e.type === 'text' || e.type === 'source' || e.type === 'reset'

/** The assistant edge function, streaming its answer over server-sent events. */
export const remoteAssistant = (options: RemoteAssistantOptions): Assistant => ({
  ask: async (request, onEvent, signal) => {
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
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'text/event-stream',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        })
      } catch (error) {
        throw new AssistantError('offline', String(error))
      }
      if (!response.ok || !response.body) throw new AssistantError(kindForStatus(response.status))

      let last: ServerEvent | undefined
      try {
        await readServerEvents(response.body, (data) => {
          last = data as ServerEvent
          if (last.type === 'done' || last.type === 'error') return true
          if (isAnswerEvent(last) && !signal?.aborted) onEvent(last)
          return false
        })
      } catch (error) {
        // The connection dropped mid-answer, or the stream was not what the server sends.
        throw new AssistantError('offline', String(error))
      }
      const end = last
      if (end?.type === 'done') return
      if (end?.type === 'error')
        throw new AssistantError(KINDS.includes(end.kind) ? end.kind : 'unknown')
      // The stream ended without saying the answer was complete.
      throw new AssistantError('offline', 'The answer was cut off')
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  },
})
