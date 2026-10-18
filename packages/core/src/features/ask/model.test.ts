import { describe, expect, it } from 'vitest'
import { AssistantError, type AnswerSource } from '../../domain/types'
import { controlledAssistant, sequentialIds } from '../../testing'
import { ASK_SUGGESTIONS, createAskModel } from './model'

const vehicle = { id: 'v1', year: 2021, make: 'Toyota', model: 'RAV4', configId: 'c1' }
const recall: AnswerSource = { kind: 'recall', id: '24V001000', label: 'Recall 24V001000' }

const setup = (
  v: typeof vehicle | Omit<typeof vehicle, 'configId'> = vehicle,
  sharingAllowed?: () => boolean,
) => {
  const assistant = controlledAssistant()
  const model = createAskModel({ vehicle: v, assistant, ids: sequentialIds('m'), sharingAllowed })
  model.getState().start()
  const call = (n: number) => {
    const c = assistant.calls[n]
    if (!c) throw new Error(`No call ${n}`)
    return c
  }
  return { assistant, model, call, state: () => model.getState() }
}

/** Lets the model's promise callbacks run. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('ask model', () => {
  it('starts empty with suggestions and nothing to send, titled with the car', () => {
    const { state } = setup()
    expect(state()).toMatchObject({
      status: 'ready',
      carName: 'Toyota RAV4',
      carTitle: '2021 Toyota RAV4',
      messages: [],
      suggestions: ASK_SUGGESTIONS,
      canSend: false,
    })
  })

  it('cannot ask about a car that has not synced its configuration', () => {
    const { state, assistant } = setup({ id: 'v1', year: 2021, make: 'Toyota', model: 'RAV4' })
    expect(state().status).toBe('unmatched')
    state().setDraft('Hello?')
    state().send()
    expect(state().canSend).toBe(false)
    expect(assistant.calls).toHaveLength(0)
  })

  it('sends the trimmed draft, clears it and shows the answer as it streams', async () => {
    const { state, assistant, call } = setup()
    state().setDraft('  Any recalls? ')
    expect(state().canSend).toBe(true)
    state().send()

    expect(assistant.calls[0]?.request).toEqual({ vehicleId: 'v1', question: 'Any recalls?' })
    expect(state()).toMatchObject({ status: 'answering', draft: '', canSend: false })

    const first = call(0)
    first.emit({ type: 'conversation', id: 'conv1' })
    first.emit({ type: 'text', text: 'One: ' })
    first.emit({ type: 'text', text: 'a fuel pump.' })
    first.emit({ type: 'source', source: recall })
    first.emit({ type: 'source', source: recall })
    expect(state().messages).toEqual([
      { id: 'm-1', role: 'user', text: 'Any recalls?', sources: [], state: 'done' },
      {
        id: 'm-2',
        role: 'assistant',
        text: 'One: a fuel pump.',
        sources: [recall],
        state: 'streaming',
      },
    ])

    first.resolve()
    await settle()
    expect(state().messages[1]?.state).toBe('done')
    expect(state().status).toBe('ready')
  })

  it('clears the answer so far when the assistant starts it over', () => {
    const { state, call } = setup()
    state().ask('Any recalls?')
    call(0).emit({ type: 'text', text: 'I won' })
    call(0).emit({ type: 'source', source: recall })
    call(0).emit({ type: 'reset' })
    call(0).emit({ type: 'text', text: 'Yes.' })
    expect(state().messages[1]).toMatchObject({ text: 'Yes.', sources: [] })
  })

  it('continues the same conversation with the next question', async () => {
    const { state, assistant, call } = setup()
    state().ask('First?')
    call(0).emit({ type: 'conversation', id: 'conv1' })
    call(0).resolve()
    await settle()
    state().ask('Second?')
    expect(assistant.calls[1]?.request).toEqual({
      vehicleId: 'v1',
      conversationId: 'conv1',
      question: 'Second?',
    })
  })

  it('sends a question brought from another screen straight away when sharing is allowed', () => {
    const { state, assistant } = setup(vehicle, () => true)
    state().askAbout('Is P0420 serious?')
    expect(assistant.calls[0]?.request.question).toBe('Is P0420 serious?')
    expect(state().draft).toBe('')
  })

  it('holds a question from another screen in the draft until sharing is allowed', () => {
    let allowed = false
    const { state, assistant } = setup(vehicle, () => allowed)
    state().askAbout('Is P0420 serious?')
    expect(assistant.calls).toHaveLength(0)
    expect(state()).toMatchObject({ draft: 'Is P0420 serious?', canSend: true })
    expect(state().error).toBeUndefined()
    allowed = true
    state().send()
    expect(assistant.calls[0]?.request.question).toBe('Is P0420 serious?')
  })

  it('holds a question from another screen in the draft while an answer is streaming', () => {
    const { state, assistant } = setup(vehicle, () => true)
    state().ask('First?')
    state().askAbout('Second?')
    expect(assistant.calls).toHaveLength(1)
    expect(state().draft).toBe('Second?')
  })

  it('ignores a question while an answer is streaming', () => {
    const { state, assistant } = setup()
    state().ask('First?')
    state().ask('Second?')
    expect(assistant.calls).toHaveLength(1)
  })

  it('keeps the question and explains a failure, then retries it', async () => {
    const { state, assistant, call } = setup()
    state().ask('Any recalls?')
    call(0).emit({ type: 'text', text: 'Partial' })
    call(0).reject(new AssistantError('offline'))
    await settle()
    expect(state().messages.map((m) => m.text)).toEqual(['Any recalls?'])
    expect(state().error).toEqual({
      kind: 'offline',
      message: "You're offline. Ask needs a connection.",
    })

    state().retry()
    expect(assistant.calls[1]?.request.question).toBe('Any recalls?')
    expect(state().messages.map((m) => m.text)).toEqual(['Any recalls?', ''])
    expect(state().error).toBeUndefined()
  })

  it('treats an unexpected failure as unknown', async () => {
    const { state, call } = setup()
    state().ask('?')
    call(0).reject(new Error('boom'))
    await settle()
    expect(state().error?.kind).toBe('unknown')
  })

  it('stops an answer, keeping what arrived and cancelling the request', async () => {
    const { state, assistant, call } = setup()
    state().ask('Tell me everything')
    call(0).emit({ type: 'text', text: 'Well,' })
    state().stop()
    expect(assistant.calls[0]?.signal?.aborted).toBe(true)
    expect(state().status).toBe('ready')
    expect(state().messages[1]).toMatchObject({ text: 'Well,', state: 'stopped' })

    // Whatever the cancelled request does afterwards changes nothing.
    call(0).emit({ type: 'text', text: ' more' })
    call(0).reject(new Error('aborted'))
    await settle()
    expect(state().messages[1]?.text).toBe('Well,')
    expect(state().error).toBeUndefined()
  })

  it('drops an answer stopped before any text arrived', () => {
    const { state } = setup()
    state().ask('?')
    state().stop()
    expect(state().messages.map((m) => m.role)).toEqual(['user'])
  })

  it('starts a new conversation with no history', async () => {
    const { state, assistant, call } = setup()
    state().ask('First?')
    call(0).emit({ type: 'conversation', id: 'conv1' })
    call(0).resolve()
    await settle()
    state().newConversation()
    expect(state().messages).toEqual([])
    state().ask('Fresh?')
    expect(assistant.calls[1]?.request).toEqual({ vehicleId: 'v1', question: 'Fresh?' })
  })

  it('stops a streaming answer when disposed', () => {
    const { state, assistant, model } = setup()
    state().ask('?')
    model.getState().dispose()
    expect(assistant.calls[0]?.signal?.aborted).toBe(true)
    expect(state().status).toBe('ready')
  })

  it('refuses a question longer than the limit', () => {
    const { state } = setup()
    state().setDraft('x'.repeat(1_001))
    expect(state().canSend).toBe(false)
  })
})
