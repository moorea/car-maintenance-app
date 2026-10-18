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
export const readPhotoWithClaude = (
  client: Anthropic,
  prompt: PhotoPrompt,
  photo: QuotePhoto,
  signal?: CancelSignal,
): Promise<unknown> =>
  askClaudeForJson(
    client,
    { ...prompt, effort: 'low' },
    [
      {
        type: 'image',
        source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 },
      },
      { type: 'text', text: prompt.ask },
    ],
    signal,
  )

/**
 * Sends one message to Claude with structured output, so the reply is always the expected JSON,
 * and returns that JSON unchecked.
 */
export const askClaudeForJson = async (
  client: Anthropic,
  prompt: Omit<PhotoPrompt, 'ask'> & { effort: 'low' | 'medium' | 'high' },
  content: Anthropic.Beta.Messages.BetaContentBlockParam[],
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
        messages: [{ role: 'user', content }],
        output_config: {
          effort: prompt.effort,
          format: { type: 'json_schema', schema: prompt.schema },
        },
        // On a safety decline the API retries on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal: controller.signal },
    )
    if (message.stop_reason === 'refusal') throw new AssistantError('declined')
    // Cut off mid-reply, the JSON is incomplete. Unlikely, since the replies are short.
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

export interface JsonHandlerDeps<Reader> {
  /** The signed-in user an access token belongs to, or undefined if it is not valid. */
  userFor(token: string): Promise<string | undefined>
  /** Records a use against the owner's daily assistant limit; see AssistantStore. */
  storeFor(token: string, userId: string): Pick<AssistantStore, 'claimQuestion'>
  /** Undefined until the model's API key is configured. */
  reader: Reader | undefined
  /** Shared with questions to Ask: each request costs about as much as an answer. */
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

export type PhotoHandlerDeps<Reader> = JsonHandlerDeps<Reader>

/**
 * A POST endpoint that reads one photo for the signed-in owner. Body: `{ photo: { mediaType,
 * base64 } }`. Answers what `read` returns, or `{ error }` with a status code. The photo is not
 * stored. `what` names the photo in logs, such as "a quote".
 */
export const createPhotoHandler = <Reader>(
  deps: PhotoHandlerDeps<Reader>,
  what: string,
  read: (reader: Reader, photo: QuotePhoto, signal: AbortSignal) => Promise<unknown>,
) =>
  createJsonHandler(deps, `reading ${what}`, readQuoteRequestSchema, (reader, body, signal) =>
    read(reader, body.photo, signal),
  )

/**
 * A POST endpoint that runs one model request for the signed-in owner, counted against the daily
 * limit. The body must match `schema`, checked before anything is spent. Answers what `run`
 * returns, or `{ error }` with a status code. `doing` names the request in logs, such as
 * "reading a quote".
 */
export const createJsonHandler = <Reader, Body>(
  deps: JsonHandlerDeps<Reader>,
  doing: string,
  schema: { safeParse(value: unknown): { success: true; data: Body } | { success: false } },
  run: (reader: Reader, body: Body, signal: AbortSignal) => Promise<unknown>,
) => {
  const what = doing.charAt(0).toUpperCase() + doing.slice(1)
  const handle = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return failure('unknown')

    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    const userId = token ? await deps.userFor(token) : undefined
    if (!token || !userId) return failure('signed-out')

    const parsed = schema.safeParse(await request.json().catch(() => undefined))
    if (!parsed.success) return json(400, { error: 'unknown' })

    const reader = deps.reader
    if (!reader) return failure('unavailable')
    if (!(await deps.storeFor(token, userId).claimQuestion(deps.dailyLimit)))
      return failure('rate-limited')

    try {
      return json(200, await run(reader, parsed.data, request.signal))
    } catch (error) {
      if (error instanceof AssistantError) {
        if (error.kind === 'unavailable') deps.log(`${what} failed`, error)
        return failure(error.kind)
      }
      deps.log(`${what} failed`, error)
      return failure('unknown')
    }
  }

  return async (request: Request): Promise<Response> => {
    try {
      return await handle(request)
    } catch (error) {
      deps.log(`Request for ${doing} failed`, error)
      return failure('unknown')
    }
  }
}
