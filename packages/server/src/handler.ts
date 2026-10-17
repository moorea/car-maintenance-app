import {
  answerQuestion,
  askRequestSchema,
  cancellation,
  AssistantError,
  type AnswerEvent,
  type AnswerSource,
  type AssistantErrorKind,
  type CarFacts,
  type ChatTurn,
  type LanguageModel,
} from '@car/core'

/** What the assistant endpoint reads and writes for one signed-in owner. */
export interface AssistantStore {
  /** Everything stored about the owner's car, or undefined when they have no such car. */
  facts(vehicleId: string): Promise<CarFacts | undefined>
  /**
   * The conversation to add this question to: `conversationId` when it is the owner's and about
   * this car, otherwise a new one.
   */
  conversation(vehicleId: string, conversationId: string | undefined): Promise<string>
  /** The conversation's earlier turns, oldest first. */
  history(conversationId: string): Promise<ChatTurn[]>
  /**
   * Records a question against the owner's daily limit, unless they have already asked `limit`
   * in the last 24 hours. Returns whether it was recorded. A question counts once recorded,
   * whether or not its answer finishes, since the model is paid for either way.
   */
  claimQuestion(limit: number): Promise<boolean>
  saveTurn(
    conversationId: string,
    question: string,
    answer: { text: string; sources: AnswerSource[] },
  ): Promise<void>
}

export interface AssistantHandlerDeps {
  /** The signed-in user an access token belongs to, or undefined if it is not valid. */
  userFor(token: string): Promise<string | undefined>
  /** The owner's data, read with their token so row-level security applies. */
  storeFor(token: string, userId: string): AssistantStore
  /** Undefined until the model's API key is configured. */
  model: LanguageModel | undefined
  /** Questions each owner may ask in a rolling day, which caps what one account can cost. */
  dailyLimit: number
  today(): string
  log(message: string, error?: unknown): void
}

/** What the endpoint streams: the answer's events, then `done` or `error`. */
export type ServerEvent =
  AnswerEvent | { type: 'done' } | { type: 'error'; kind: AssistantErrorKind }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const failure = (status: number, kind: AssistantErrorKind) => json(status, { error: kind })

const sse = (event: ServerEvent) => `data: ${JSON.stringify(event)}\n\n`

/**
 * POST /functions/v1/assistant: answers one question about one of the signed-in owner's cars,
 * streaming the answer as server-sent events. Body: `{ vehicleId, conversationId?, question }`.
 * Failures before the answer starts are plain JSON `{ error }` with a status code; failures once
 * it has started arrive as an `error` event.
 */
export const createAssistantHandler = (deps: AssistantHandlerDeps) => {
  const handle = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return failure(405, 'unknown')

    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    const userId = token ? await deps.userFor(token) : undefined
    if (!token || !userId) return failure(401, 'signed-out')

    const parsed = askRequestSchema.safeParse(await request.json().catch(() => undefined))
    if (!parsed.success) return failure(400, 'unknown')
    const { vehicleId, conversationId: requested, question } = parsed.data

    const model = deps.model
    if (!model) return failure(503, 'unavailable')

    const store = deps.storeFor(token, userId)
    const facts = await store.facts(vehicleId)
    if (!facts) return failure(404, 'not-found')
    if (!(await store.claimQuestion(deps.dailyLimit))) return failure(429, 'rate-limited')
    const conversationId = await store.conversation(vehicleId, requested)
    const history = await store.history(conversationId)

    // Stops the model when the owner stops the answer or leaves.
    const { signal, cancel } = cancellation()
    request.signal.addEventListener('abort', cancel)
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start: async (controller) => {
        const send = (event: ServerEvent) => {
          if (!signal.aborted) controller.enqueue(encoder.encode(sse(event)))
        }
        send({ type: 'conversation', id: conversationId })
        try {
          const answer = await answerQuestion({
            facts: { ...facts, today: deps.today() },
            history,
            question,
            model,
            onText: (text) => send({ type: 'text', text }),
            onSource: (source) => send({ type: 'source', source }),
            onReset: () => send({ type: 'reset' }),
            signal,
          })
          // An answer the owner left before it finished is not kept as part of the conversation.
          if (!signal.aborted) {
            await store.saveTurn(conversationId, question, answer)
            send({ type: 'done' })
          }
        } catch (error) {
          const kind = error instanceof AssistantError ? error.kind : 'unknown'
          // Stopping or leaving aborts the model's request; that is not a fault.
          if (!signal.aborted && (!(error instanceof AssistantError) || kind === 'unavailable'))
            deps.log('Assistant answer failed', error)
          send({ type: 'error', kind })
        } finally {
          try {
            controller.close()
          } catch {
            // Already cancelled by the owner leaving.
          }
        }
      },
    })
    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
    })
  }

  return async (request: Request): Promise<Response> => {
    try {
      return await handle(request)
    } catch (error) {
      deps.log('Assistant request failed', error)
      return failure(500, 'unknown')
    }
  }
}
