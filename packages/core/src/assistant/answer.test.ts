import { describe, expect, it } from 'vitest'
import { AssistantError, type AnswerSource } from '../domain/types'
import { cancellation } from '../lib/cancel'
import { scriptedModel } from '../testing'
import { answerQuestion, CUT_SHORT_NOTE, MAX_HISTORY_TURNS } from './answer'
import { ASSISTANT_SYSTEM_PROMPT, type CarFacts } from './grounding'

const facts: CarFacts = {
  vehicle: {
    id: 'v1',
    configId: 'c1',
    year: 2021,
    make: 'Toyota',
    model: 'RAV4',
    nickname: 'Rav',
    severeDuty: false,
  },
  today: '2026-10-17',
  readings: [],
  schedule: [{ id: 'oil', configId: 'c1', task: 'Oil change', intervalMiles: 10_000 }],
  records: [],
  safety: { recalls: [], complaints: [] },
  complaints: [],
}

const collect = () => {
  const text: string[] = []
  const sources: AnswerSource[] = []
  const resets: number[] = []
  return {
    text,
    sources,
    resets,
    onText: (t: string) => void text.push(t),
    onSource: (s: AnswerSource) => void sources.push(s),
    onReset: () => void resets.push(text.length),
  }
}

describe('answerQuestion', () => {
  it('sends the fixed instructions, the stored facts and the conversation to the model', async () => {
    const model = scriptedModel()
    await answerQuestion({
      facts,
      history: [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello' },
      ],
      question: 'When is the oil due?',
      model,
      ...collect(),
    })
    const [request] = model.requests
    expect(request?.system).toBe(ASSISTANT_SYSTEM_PROMPT)
    expect(request?.documents.map((d) => d.title)).toEqual(['The car', 'Schedule: Oil change'])
    expect(request?.turns).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'When is the oil due?' },
    ])
  })

  it('streams the text and turns each cited document into its source once', async () => {
    const model = scriptedModel(() => ({
      events: [
        { type: 'text', text: 'Every ' },
        { type: 'text', text: '10,000 mi.' },
        { type: 'citation', documentIndex: 1 },
        { type: 'citation', documentIndex: 1 },
      ],
    }))
    const out = collect()
    const answer = await answerQuestion({ facts, history: [], question: 'Oil?', model, ...out })
    expect(out.text).toEqual(['Every ', '10,000 mi.'])
    expect(out.sources).toEqual([{ kind: 'schedule', id: 'oil', label: 'Schedule: Oil change' }])
    expect(answer).toEqual({ text: 'Every 10,000 mi.', sources: out.sources })
  })

  it('ignores a citation of a document that was never sent', async () => {
    const model = scriptedModel(() => ({ events: [{ type: 'citation', documentIndex: 9 }] }))
    const out = collect()
    await answerQuestion({ facts, history: [], question: 'Oil?', model, ...out })
    expect(out.sources).toEqual([])
  })

  it('keeps only recent history, starting with a question', async () => {
    const history = Array.from({ length: MAX_HISTORY_TURNS + 3 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `turn ${i}`,
    }))
    const model = scriptedModel()
    await answerQuestion({ facts, history, question: 'Now?', model, ...collect() })
    const turns = model.requests[0]?.turns ?? []
    expect(turns[0]?.role).toBe('user')
    expect(turns.length).toBeLessThanOrEqual(MAX_HISTORY_TURNS + 1)
    expect(turns.at(-1)).toEqual({ role: 'user', text: 'Now?' })
  })

  it('fails as declined when the model declines to answer', async () => {
    const model = scriptedModel(() => ({ events: [], stop: 'declined' }))
    await expect(
      answerQuestion({ facts, history: [], question: '?', model, ...collect() }),
    ).rejects.toEqual(new AssistantError('declined'))
  })

  it('says so at the end of an answer cut off at the length limit', async () => {
    const model = scriptedModel(() => ({
      events: [{ type: 'text', text: 'So' }],
      stop: 'max-tokens',
    }))
    const out = collect()
    const answer = await answerQuestion({ facts, history: [], question: '?', model, ...out })
    expect(answer.text).toBe(`So${CUT_SHORT_NOTE}`)
    expect(out.text).toEqual(['So', CUT_SHORT_NOTE])
  })

  it('starts over when a fallback model takes over partway, dropping the first text and sources', async () => {
    const model = scriptedModel(() => ({
      events: [
        { type: 'text', text: 'I won' },
        { type: 'citation', documentIndex: 0 },
        { type: 'reset' },
        { type: 'text', text: 'Every 10,000 mi.' },
        { type: 'citation', documentIndex: 1 },
      ],
    }))
    const out = collect()
    const answer = await answerQuestion({ facts, history: [], question: 'Oil?', model, ...out })
    expect(out.resets).toEqual([1])
    expect(answer).toEqual({
      text: 'Every 10,000 mi.',
      sources: [{ kind: 'schedule', id: 'oil', label: 'Schedule: Oil change' }],
    })
  })

  it('stops passing on events once cancelled', async () => {
    const { signal, cancel } = cancellation()
    cancel()
    const model = scriptedModel(() => ({ events: [{ type: 'text', text: 'late' }] }))
    const out = collect()
    await answerQuestion({ facts, history: [], question: '?', model, signal, ...out })
    expect(out.text).toEqual([])
  })
})
