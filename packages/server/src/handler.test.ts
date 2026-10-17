import { AssistantError, type CarFacts, type ChatTurn } from '@car/core'
import { scriptedModel, type ModelScript } from '@car/core/testing'
import { describe, expect, it } from 'vitest'
import { createAssistantHandler, type AssistantStore, type ServerEvent } from './handler'

const VEHICLE = '00000000-0000-4000-8000-000000000001'
const CONVERSATION = '00000000-0000-4000-8000-0000000000c1'

const facts: CarFacts = {
  vehicle: {
    id: VEHICLE,
    configId: 'c1',
    year: 2021,
    make: 'Toyota',
    model: 'RAV4',
    nickname: 'Rav',
    severeDuty: false,
  },
  today: '2000-01-01',
  readings: [],
  schedule: [{ id: 'oil', configId: 'c1', task: 'Oil change', intervalMiles: 10_000 }],
  records: [],
  safety: { recalls: [], complaints: [] },
  complaints: [],
}

const memoryStore = (options: { asked?: number; history?: ChatTurn[]; owns?: boolean } = {}) => {
  const saved: { conversationId: string; question: string; text: string }[] = []
  let asked = options.asked ?? 0
  const store: AssistantStore & { saved: typeof saved; asked: () => number } = {
    saved,
    asked: () => asked,
    facts: async (id) => (options.owns !== false && id === VEHICLE ? facts : undefined),
    conversation: async (_vehicleId, id) => id ?? CONVERSATION,
    history: async () => options.history ?? [],
    claimQuestion: async (limit) => {
      if (asked >= limit) return false
      asked += 1
      return true
    },
    saveTurn: async (conversationId, question, answer) =>
      void saved.push({ conversationId, question, text: answer.text }),
  }
  return store
}

const setup = (
  options: {
    script?: ModelScript
    store?: ReturnType<typeof memoryStore>
    noModel?: boolean
    dailyLimit?: number
  } = {},
) => {
  const store = options.store ?? memoryStore()
  const model = scriptedModel(options.script)
  const logged: string[] = []
  const handler = createAssistantHandler({
    userFor: async (token) => (token === 'good' ? 'u1' : undefined),
    storeFor: () => store,
    model: options.noModel ? undefined : model,
    dailyLimit: options.dailyLimit ?? 50,
    today: () => '2026-10-17',
    log: (message) => void logged.push(message),
  })
  return { handler, store, model, logged }
}

const post = (body: unknown, token: string | null = 'good') =>
  new Request('http://localhost/assistant', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const events = async (response: Response): Promise<ServerEvent[]> =>
  (await response.text())
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as ServerEvent)

const question = { vehicleId: VEHICLE, question: 'When is the oil due?' }

describe('assistant endpoint', () => {
  it('streams the answer with its sources and saves the turn', async () => {
    const { handler, store } = setup({
      script: () => ({
        events: [
          { type: 'text', text: 'Every 10,000 mi.' },
          { type: 'citation', documentIndex: 1 },
        ],
      }),
    })
    const response = await handler(post(question))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(await events(response)).toEqual([
      { type: 'conversation', id: CONVERSATION },
      { type: 'text', text: 'Every 10,000 mi.' },
      { type: 'source', source: { kind: 'schedule', id: 'oil', label: 'Schedule: Oil change' } },
      { type: 'done' },
    ])
    expect(store.saved).toEqual([
      { conversationId: CONVERSATION, question: 'When is the oil due?', text: 'Every 10,000 mi.' },
    ])
  })

  it("answers from the conversation's history and today's date", async () => {
    const store = memoryStore({ history: [{ role: 'user', text: 'Earlier' }] })
    const { handler, model } = setup({ store })
    await events(await handler(post({ ...question, conversationId: CONVERSATION })))
    expect(model.requests[0]?.turns).toEqual([
      { role: 'user', text: 'Earlier' },
      { role: 'user', text: 'When is the oil due?' },
    ])
    expect(model.requests[0]?.documents[0]?.text).toContain('Today is 2026-10-17.')
  })

  it('refuses a request without a valid sign-in', async () => {
    const { handler } = setup()
    expect((await handler(post(question, null))).status).toBe(401)
    const response = await handler(post(question, 'forged'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'signed-out' })
  })

  it('refuses a malformed question before spending anything', async () => {
    const { handler, model } = setup()
    expect((await handler(post('not json'))).status).toBe(400)
    expect((await handler(post({ vehicleId: 'v1', question: 'Hi' }))).status).toBe(400)
    expect((await handler(post({ vehicleId: VEHICLE, question: '  ' }))).status).toBe(400)
    expect(model.requests).toHaveLength(0)
  })

  it('says the assistant is unavailable until the model is configured', async () => {
    const { handler } = setup({ noModel: true })
    const response = await handler(post(question))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('stops an owner at the daily limit before asking the model', async () => {
    const store = memoryStore({ asked: 5 })
    const { handler, model } = setup({ store, dailyLimit: 5 })
    const response = await handler(post(question))
    expect(response.status).toBe(429)
    expect(model.requests).toHaveLength(0)
  })

  it('counts a question against the limit even when its answer fails', async () => {
    const store = memoryStore()
    const { handler } = setup({ store, script: () => new AssistantError('unavailable') })
    await events(await handler(post(question)))
    expect(store.asked()).toBe(1)
  })

  it('does not count a question about a car it cannot find', async () => {
    const store = memoryStore({ owns: false })
    const { handler } = setup({ store })
    await handler(post(question))
    expect(store.asked()).toBe(0)
  })

  it('tells the phone to start over when a fallback model takes over, saving only its answer', async () => {
    const { handler, store } = setup({
      script: () => ({
        events: [
          { type: 'text', text: 'I won' },
          { type: 'reset' },
          { type: 'text', text: 'Sure' },
        ],
      }),
    })
    const sent = await events(await handler(post(question)))
    expect(sent.slice(1)).toEqual([
      { type: 'text', text: 'I won' },
      { type: 'reset' },
      { type: 'text', text: 'Sure' },
      { type: 'done' },
    ])
    expect(store.saved.map((s) => s.text)).toEqual(['Sure'])
  })

  it("does not answer about a car that is not the owner's", async () => {
    const { handler } = setup({ store: memoryStore({ owns: false }) })
    const response = await handler(post(question))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not-found' })
  })

  it('ends the stream with the reason when the answer fails', async () => {
    const { handler, store, logged } = setup({ script: () => new AssistantError('unavailable') })
    const sent = await events(await handler(post(question)))
    expect(sent.at(-1)).toEqual({ type: 'error', kind: 'unavailable' })
    expect(store.saved).toEqual([])
    expect(logged).toEqual(['Assistant answer failed'])
  })

  it('does not log an answer the owner stopped as a fault', async () => {
    const leave = new AbortController()
    const { handler, logged } = setup({
      script: () => {
        leave.abort()
        return new Error('Request was aborted.')
      },
    })
    const request = new Request(post(question), { signal: leave.signal })
    await (await handler(request)).text().catch(() => '')
    expect(logged).toEqual([])
  })

  it('reports a decline without logging it as a fault', async () => {
    const { handler, logged } = setup({ script: () => ({ events: [], stop: 'declined' }) })
    const sent = await events(await handler(post(question)))
    expect(sent.at(-1)).toEqual({ type: 'error', kind: 'declined' })
    expect(logged).toEqual([])
  })

  it('answers 500 when the store fails before the answer starts', async () => {
    const store = memoryStore()
    store.facts = async () => {
      throw new Error('database down')
    }
    const { handler, logged } = setup({ store })
    expect((await handler(post(question))).status).toBe(500)
    expect(logged).toEqual(['Assistant request failed'])
  })

  it('only accepts POST', async () => {
    const { handler } = setup()
    expect((await handler(new Request('http://localhost/assistant'))).status).toBe(405)
  })
})
