import { answerQuestion } from '../assistant/answer'
import type { CarFacts } from '../assistant/grounding'
import { AssistantError } from '../domain/types'
import type {
  AnswerEvent,
  AskRequest,
  Assistant,
  CancelSignal,
  ChatTurn,
  LanguageModel,
  ModelEvent,
  ModelRequest,
  ModelStopReason,
} from '../ports'

/** One call to a `controlledAssistant`, which the test answers by hand. */
export interface AssistantCall {
  request: AskRequest
  signal: CancelSignal | undefined
  emit: (event: AnswerEvent) => void
  resolve: () => void
  reject: (error: unknown) => void
}

/** An assistant whose answers the test streams step by step through `calls`. */
export const controlledAssistant = (): Assistant & { calls: AssistantCall[] } => {
  const calls: AssistantCall[] = []
  return {
    calls,
    ask: (request, onEvent, signal) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ request, signal, emit: onEvent, resolve, reject })
      }),
  }
}

/** What a scripted model answers: its events and how it stops, or an error to throw. */
export type ModelScript = (
  request: ModelRequest,
) => { events: ModelEvent[]; stop?: ModelStopReason } | Error

/** A language model that plays back a script and records every request it was sent. */
export const scriptedModel = (
  script: ModelScript = () => ({ events: [{ type: 'text', text: 'OK' }] }),
): LanguageModel & { requests: ModelRequest[] } => {
  const requests: ModelRequest[] = []
  return {
    requests,
    stream: async (request, onEvent) => {
      requests.push(request)
      const result = script(request)
      if (result instanceof Error) throw result
      for (const event of result.events) onEvent(event)
      return result.stop ?? 'end'
    },
  }
}

// Core has no DOM or Node types; every runtime the demo runs on has a timer.
declare const setTimeout: (callback: () => void, ms: number) => unknown

const words = (text: string) => text.match(/\S+\s*/g) ?? []

/**
 * A model for demos with no backend. It cites the documents whose titles share a word with the
 * question and reads out their first line, word by word, so streaming and source chips can be
 * seen. It knows nothing else.
 */
export const demoModel = (options: { delayMs?: number } = {}): LanguageModel => {
  const delay = options.delayMs ?? 30
  const wait = () => new Promise<void>((r) => setTimeout(r, delay))
  return {
    stream: async (request, onEvent, signal) => {
      const question = (request.turns.at(-1)?.text ?? '').toLowerCase()
      const terms = question.match(/[a-z]{4,}/g) ?? []
      const stem = (w: string) => w.replace(/(es|s)$/, '')
      const matches = request.documents
        .map((doc, index) => ({ doc, index }))
        .filter(({ doc }) => {
          const title = doc.title.toLowerCase()
          return terms.some((t) => title.includes(stem(t)))
        })
        .slice(0, 3)
      const parts: { text: string; cite?: number }[] =
        matches.length === 0
          ? [
              {
                text: 'This is the demo, which only knows a few sample facts about the car. Try asking about its schedule, recalls or complaints.',
              },
            ]
          : [
              { text: 'Here is what the app has stored. ' },
              ...matches.map(({ doc, index }) => ({
                text: `${doc.text.split('\n')[0] ?? ''} `,
                cite: index,
              })),
            ]
      for (const part of parts) {
        for (const word of words(part.text)) {
          if (signal?.aborted) return 'end'
          await wait()
          onEvent({ type: 'text', text: word })
        }
        if (part.cite !== undefined) onEvent({ type: 'citation', documentIndex: part.cite })
      }
      return 'end'
    },
  }
}

/**
 * An assistant that answers on the device from facts it is handed, the way the server does. For
 * demos and tests; the app's real assistant runs on the server.
 */
export const localAssistant = (deps: {
  facts: (vehicleId: string) => Promise<CarFacts | undefined>
  model: LanguageModel
}): Assistant => {
  const conversations = new Map<string, ChatTurn[]>()
  let next = 0
  return {
    ask: async (request, onEvent, signal) => {
      const facts = await deps.facts(request.vehicleId)
      if (!facts) throw new AssistantError('not-found')
      const id = request.conversationId ?? `conversation-${++next}`
      const history = conversations.get(id) ?? []
      onEvent({ type: 'conversation', id })
      const answer = await answerQuestion({
        facts,
        history,
        question: request.question,
        model: deps.model,
        onText: (text) => onEvent({ type: 'text', text }),
        onSource: (source) => onEvent({ type: 'source', source }),
        onReset: () => onEvent({ type: 'reset' }),
        ...(signal && { signal }),
      })
      conversations.set(id, [
        ...history,
        { role: 'user', text: request.question },
        { role: 'assistant', text: answer.text },
      ])
    },
  }
}
