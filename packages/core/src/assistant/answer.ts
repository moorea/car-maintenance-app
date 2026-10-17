import { AssistantError, type AnswerSource } from '../domain/types'
import type { CancelSignal, ChatTurn, LanguageModel } from '../ports'
import { ASSISTANT_SYSTEM_PROMPT, groundingDocuments, type CarFacts } from './grounding'

/** Earlier turns beyond this many are left out of the prompt. */
export const MAX_HISTORY_TURNS = 20

export interface AnswerInput {
  facts: CarFacts
  /** The conversation so far, oldest first, without the new question. */
  history: ChatTurn[]
  question: string
  model: LanguageModel
  /** Called with each piece of text as it streams. */
  onText: (text: string) => void
  /** Called once per stored fact, the first time the answer cites it. */
  onSource: (source: AnswerSource) => void
  signal?: CancelSignal
}

export interface Answer {
  text: string
  sources: AnswerSource[]
  /** True when the model hit its length limit, so the text ends mid-thought. */
  truncated: boolean
}

/** Keeps the newest turns and makes sure the first one is the owner's, as the model requires. */
const trimHistory = (history: ChatTurn[]): ChatTurn[] => {
  const recent = history.slice(-MAX_HISTORY_TURNS)
  const firstUser = recent.findIndex((t) => t.role === 'user')
  return firstUser === -1 ? [] : recent.slice(firstUser)
}

/**
 * Answers one question about the owner's car from its stored facts, streaming the text and the
 * sources it cites. A citation of anything other than a stored fact cannot happen: the model can
 * only cite the documents it was given, and each maps back to one fact.
 */
export const answerQuestion = async (input: AnswerInput): Promise<Answer> => {
  const documents = groundingDocuments(input.facts)
  const sources: AnswerSource[] = []
  let text = ''

  const stop = await input.model.stream(
    {
      system: ASSISTANT_SYSTEM_PROMPT,
      documents: documents.map(({ title, text: body }) => ({ title, text: body })),
      turns: [...trimHistory(input.history), { role: 'user', text: input.question }],
    },
    (event) => {
      if (input.signal?.aborted) return
      if (event.type === 'text') {
        text += event.text
        input.onText(event.text)
        return
      }
      const source = documents[event.documentIndex]?.source
      if (!source || sources.some((s) => s.kind === source.kind && s.id === source.id)) return
      sources.push(source)
      input.onSource(source)
    },
    input.signal,
  )

  if (stop === 'declined') throw new AssistantError('declined')
  return { text, sources, truncated: stop === 'max-tokens' }
}
