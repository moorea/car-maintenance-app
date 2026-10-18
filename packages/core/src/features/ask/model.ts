import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  AssistantError,
  type AnswerSource,
  type AssistantErrorKind,
  type Vehicle,
} from '../../domain/types'
import { cancellation } from '../../lib/cancel'
import type { Assistant, IdGenerator } from '../../ports'
import { MAX_QUESTION_LENGTH } from '../../schemas/ask'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** The stored facts an answer cites, in the order it first cited them. Empty for questions. */
  sources: AnswerSource[]
  /**
   * - `streaming`: the answer is still arriving.
   * - `done`: complete.
   * - `stopped`: the owner stopped it, so it may end mid-sentence.
   */
  state: 'streaming' | 'done' | 'stopped'
}

/** A ready-made question shown before the first one, such as "Recalls". */
export interface Suggestion {
  label: string
  question: string
}

/**
 * - `unmatched`: the car has not synced back with its configuration, so the server cannot
 *   answer about it yet.
 * - `ready`: waiting for a question.
 * - `answering`: an answer is streaming in.
 */
export type AskStatus = 'unmatched' | 'ready' | 'answering'

export interface AskState {
  status: AskStatus
  /** "Toyota RAV4", for the composer's placeholder. */
  carName: string
  /** "2021 Toyota RAV4 XLE", under the screen's title. */
  carTitle: string
  messages: ChatMessage[]
  draft: string
  /** Shown only while there are no messages. */
  suggestions: Suggestion[]
  /** Why the last question got no answer. Cleared by the next question. */
  error?: { kind: AssistantErrorKind; message: string } | undefined
  /** True when the draft can be sent now. */
  canSend: boolean
}

export interface AskActions {
  start: () => void
  setDraft: (text: string) => void
  /** Sends the draft. */
  send: () => void
  /** Sends a question without touching the draft, as a suggestion does. */
  ask: (question: string) => void
  /** Stops the answer that is streaming, keeping what has arrived. */
  stop: () => void
  /** Asks the question that last failed again. */
  retry: () => void
  /** Clears the conversation so the next question starts a new one. */
  newConversation: () => void
  dispose: () => void
}

export type AskModel = StoreApi<AskState & AskActions>

export interface AskDeps {
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'trim' | 'configId'>
  assistant: Assistant
  ids: IdGenerator
}

export const ASK_SUGGESTIONS: Suggestion[] = [
  { label: "What's due next?", question: 'What maintenance is due next?' },
  { label: 'Any recalls?', question: 'Are there any recalls I should know about?' },
  { label: 'Common problems', question: 'What problems do other owners report with this car?' },
]

const ERROR_MESSAGES: Record<AssistantErrorKind, string> = {
  offline: "You're offline. Ask needs a connection.",
  'signed-out': 'Sign in again to use Ask.',
  'not-found': "This car hasn't finished syncing yet. Try again in a minute.",
  'rate-limited': "You've asked a lot of questions today. Try again tomorrow.",
  unavailable: "Ask isn't available right now. Try again later.",
  declined: "That's not something I can answer. Try asking another way.",
  'not-allowed': 'Ask is turned off in Account. Turn on sharing with Anthropic to use it.',
  unknown: 'Something went wrong. Try again.',
}

const canSend = (status: AskStatus, draft: string) =>
  status === 'ready' && draft.trim().length > 0 && draft.trim().length <= MAX_QUESTION_LENGTH

/**
 * Screen model for asking the assistant about one car. The conversation lives in the model, so
 * keeping the model keeps the conversation; disposing it stops any answer still streaming.
 */
export const createAskModel = (deps: AskDeps): AskModel => {
  const { vehicle } = deps
  let conversationId: string | undefined
  let inFlight: { cancel: () => void } | undefined
  /** The question that last failed, for retry. */
  let failedQuestion: string | undefined

  return createStore<AskState & AskActions>()((set, get) => {
    const updateAnswer = (id: string, change: (m: ChatMessage) => Partial<ChatMessage>) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...change(m) } : m)) }))

    const finish = (status: AskStatus) =>
      set((s) => ({ status, canSend: canSend(status, s.draft) }))

    const ask = (raw: string) => {
      const question = raw.trim()
      if (get().status !== 'ready' || question === '' || question.length > MAX_QUESTION_LENGTH)
        return
      const questionId = deps.ids.next()
      const answerId = deps.ids.next()
      const { signal, cancel } = cancellation()
      inFlight = { cancel }
      failedQuestion = undefined
      set((s) => ({
        status: 'answering',
        canSend: false,
        error: undefined,
        messages: [
          ...s.messages,
          { id: questionId, role: 'user', text: question, sources: [], state: 'done' },
          { id: answerId, role: 'assistant', text: '', sources: [], state: 'streaming' },
        ],
      }))

      const request = { vehicleId: vehicle.id, question, ...(conversationId && { conversationId }) }
      deps.assistant
        .ask(
          request,
          (event) => {
            if (signal.aborted) return
            if (event.type === 'conversation') conversationId = event.id
            else if (event.type === 'reset')
              updateAnswer(answerId, () => ({ text: '', sources: [] }))
            else if (event.type === 'text')
              updateAnswer(answerId, (m) => ({ text: m.text + event.text }))
            else
              updateAnswer(answerId, (m) =>
                m.sources.some((s) => s.kind === event.source.kind && s.id === event.source.id)
                  ? {}
                  : { sources: [...m.sources, event.source] },
              )
          },
          signal,
        )
        .then(
          () => {
            if (signal.aborted) return
            updateAnswer(answerId, () => ({ state: 'done' }))
            finish('ready')
          },
          (error: unknown) => {
            if (signal.aborted) return
            const kind = error instanceof AssistantError ? error.kind : 'unknown'
            failedQuestion = question
            // The question stays, so the owner sees what failed; a partial answer does not.
            set((s) => ({
              messages: s.messages.filter((m) => m.id !== answerId),
              error: { kind, message: ERROR_MESSAGES[kind] },
            }))
            finish('ready')
          },
        )
        .finally(() => {
          if (inFlight?.cancel === cancel) inFlight = undefined
        })
    }

    const cancelInFlight = () => {
      inFlight?.cancel()
      inFlight = undefined
    }

    return {
      status: vehicle.configId === undefined ? 'unmatched' : 'ready',
      carName: `${vehicle.make} ${vehicle.model}`,
      carTitle: [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' '),
      messages: [],
      draft: '',
      suggestions: ASK_SUGGESTIONS,
      canSend: false,

      // Nothing to watch: the conversation lives only in this model.
      start: () => {},

      setDraft: (draft) => set((s) => ({ draft, canSend: canSend(s.status, draft) })),

      send: () => {
        if (!get().canSend) return
        const { draft } = get()
        set({ draft: '' })
        ask(draft)
      },

      ask,

      stop: () => {
        if (get().status !== 'answering') return
        cancelInFlight()
        set((s) => ({
          messages: s.messages
            .map((m) => (m.state === 'streaming' ? { ...m, state: 'stopped' as const } : m))
            // An answer stopped before any text arrived says nothing; drop it.
            .filter((m) => !(m.role === 'assistant' && m.state === 'stopped' && m.text === '')),
        }))
        finish('ready')
      },

      retry: () => {
        const question = failedQuestion
        if (question === undefined || get().status !== 'ready') return
        // The failed question is still on screen; asking again adds it back.
        set((s) => {
          const last = s.messages.at(-1)
          return {
            messages:
              last?.role === 'user' && last.text === question
                ? s.messages.slice(0, -1)
                : s.messages,
          }
        })
        ask(question)
      },

      newConversation: () => {
        cancelInFlight()
        conversationId = undefined
        failedQuestion = undefined
        set((s) => {
          const status = s.status === 'unmatched' ? 'unmatched' : 'ready'
          return { status, messages: [], error: undefined, canSend: canSend(status, s.draft) }
        })
      },

      dispose: () => get().stop(),
    }
  })
}
