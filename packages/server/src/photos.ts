import Anthropic from '@anthropic-ai/sdk'
import {
  AssistantError,
  readQuoteRequestSchema,
  type AssistantErrorKind,
  type CancelSignal,
  type QuotePhoto,
} from '@car/core'
import type { AssistantStore } from './handler'
import { translate } from './anthropic'

export interface PhotoPrompt {
  /** Such as "claude-opus-5-5". */
  model: string
  system: string
  /** The request sent beside the photo, such as "List the work on this quote." */
  ask: string
  /** The JSON schema the reply must follow. */
  schema: Record<string, unknown>
  maxTokens: number
  /** Named in the error when a reply is cut off, such as "quote". */
  what: string
}

/**
 * Sends one photo to Claude with structured output, so the reply is always the expected JSON, and
 * returns that JSON unchecked. Transcription needs care more than depth, so effort stays low.
 */
export const readPhotoWithClaude = async (
  client: Anthropic,
  prompt: PhotoPrompt,
  photo: QuotePhoto,
  signal?: CancelSignal,
): Promise<unknown> => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)
  if (signal?.aborted) abort()
  try {
    const message = await client.beta.messages.create(
      {
        model: prompt.model,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 },
              },
              { type: 'text', text: prompt.ask },
            ],
          },
        ],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: prompt.schema } },
        // On a safety decline the API retries on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal: controller.signal },
    )
    if (message.stop_reason === 'refusal') throw new AssistantError('declined')
    // Cut off mid-reply, the JSON is incomplete. Unlikely, since what is read is short.
    if (message.stop_reason === 'max_tokens')
      throw new AssistantError('unknown', `The ${prompt.what} reply was cut off`)
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    return JSON.parse(text) as unknown
  } catch (error) {
    throw translate(error)
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

export interface PhotoHandlerDeps<Reader> {
  /** The signed-in user an access token belongs to, or undefined if it is not valid. */
  userFor(token: string): Promise<string | undefined>
  /** Records a use against the owner's daily assistant limit; see AssistantStore. */
  storeFor(token: string, userId: string): Pick<AssistantStore, 'claimQuestion'>
  /** Undefined until the model's API key is configured. */
  reader: Reader | undefined
  /** Shared with questions to Ask: reading a photo costs about as much as an answer. */
  dailyLimit: number
  log(message: string, error?: unknown): void
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const STATUS: Record<AssistantErrorKind, number> = {
  offline: 503,
  'signed-out': 401,
  'not-found': 404,
  'rate-limited': 429,
  unavailable: 503,
  declined: 422,
  // Never raised on the server: the app refuses before sending. Kept for completeness.
  'not-allowed': 403,
  unknown: 500,
}

const failure = (kind: AssistantErrorKind) => json(STATUS[kind], { error: kind })

/**
 * A POST endpoint that reads one photo for the signed-in owner. Body: `{ photo: { mediaType,
 * base64 } }`. Answers what `read` returns, or `{ error }` with a status code. The photo is not
 * stored. `what` names the photo in logs, such as "a quote".
 */
export const createPhotoHandler = <Reader>(
  deps: PhotoHandlerDeps<Reader>,
  what: string,
  read: (reader: Reader, photo: QuotePhoto, signal: AbortSignal) => Promise<unknown>,
) => {
  const handle = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return failure('unknown')

    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    const userId = token ? await deps.userFor(token) : undefined
    if (!token || !userId) return failure('signed-out')

    const parsed = readQuoteRequestSchema.safeParse(await request.json().catch(() => undefined))
    if (!parsed.success) return json(400, { error: 'unknown' })

    const reader = deps.reader
    if (!reader) return failure('unavailable')
    if (!(await deps.storeFor(token, userId).claimQuestion(deps.dailyLimit)))
      return failure('rate-limited')

    try {
      return json(200, await read(reader, parsed.data.photo, request.signal))
    } catch (error) {
      if (error instanceof AssistantError) {
        if (error.kind === 'unavailable') deps.log(`Reading ${what} failed`, error)
        return failure(error.kind)
      }
      deps.log(`Reading ${what} failed`, error)
      return failure('unknown')
    }
  }

  return async (request: Request): Promise<Response> => {
    try {
      return await handle(request)
    } catch (error) {
      deps.log(`Request to read ${what} failed`, error)
      return failure('unknown')
    }
  }
}
