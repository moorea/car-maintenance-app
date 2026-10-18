import Anthropic from '@anthropic-ai/sdk'
import { AssistantError, type PriceEstimateRequest } from '@car/core'
import { controlledPriceEstimator } from '@car/core/testing'
import { describe, expect, it } from 'vitest'
import { anthropicPriceEstimator, createPriceHandler } from './prices'

const message = (text: string, stopReason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason: stopReason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
})

const fakeApi = (respond: () => Response) => {
  const bodies: Record<string, unknown>[] = []
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return respond()
  }
  const client = new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 })
  return { client, bodies }
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

const request: PriceEstimateRequest = {
  car: { year: 2019, make: 'Honda', model: 'CR-V', trim: 'EX' },
  zip: '94110',
  lines: [
    { index: 0, text: 'Oil change' },
    { index: 2, text: 'Front brake pads' },
  ],
}

const job = (index: number, fields: Record<string, unknown> = {}) => ({
  index,
  estimable: true,
  labor_hours_low: 0.4,
  labor_hours_high: 0.5,
  parts_low_cents: 3_500,
  parts_high_cents: 6_500,
  ...fields,
})

const reply = (lines: unknown[], rate = { low_cents: 12_000, high_cents: 18_000 }) =>
  ok(message(JSON.stringify({ labor_rate: rate, lines })))

const estimate = (api: ReturnType<typeof fakeApi>) =>
  anthropicPriceEstimator(api.client, { model: 'claude-opus-5-5' }).estimate(request)

describe('estimating prices with Claude', () => {
  it('sends the car, ZIP and lines as text and asks for structured output', async () => {
    const api = fakeApi(() => reply([]))
    await estimate(api)
    const body = api.bodies[0] as {
      messages: { content: { type: string; text: string }[] }[]
      output_config: { effort: string; format: { type: string } }
    }
    expect(JSON.parse(body.messages[0]?.content[0]?.text ?? '')).toEqual(request)
    expect(body.output_config.effort).toBe('medium')
    expect(body.output_config.format.type).toBe('json_schema')
  })

  it('returns the labor rate and each estimable line', async () => {
    const api = fakeApi(() =>
      reply([job(0), job(2, { labor_hours_low: 1.5, labor_hours_high: 2 })]),
    )
    expect(await estimate(api)).toEqual({
      laborRateCents: { low: 12_000, high: 18_000 },
      lines: [
        { index: 0, laborHours: { low: 0.4, high: 0.5 }, partsCents: { low: 3_500, high: 6_500 } },
        { index: 2, laborHours: { low: 1.5, high: 2 }, partsCents: { low: 3_500, high: 6_500 } },
      ],
    })
  })

  it('drops lines it could not estimate, was not asked about, or priced implausibly', async () => {
    const api = fakeApi(() =>
      reply([
        job(0, { estimable: false }),
        job(1),
        job(2, { labor_hours_high: 500 }),
        job(0, {
          labor_hours_low: 0,
          labor_hours_high: 0,
          parts_low_cents: 0,
          parts_high_cents: 0,
        }),
      ]),
    )
    expect((await estimate(api)).lines).toEqual([])
  })

  it('keeps the first answer for a line answered twice', async () => {
    const api = fakeApi(() => reply([job(0), job(0, { labor_hours_high: 3 })]))
    expect((await estimate(api)).lines.map((l) => l.laborHours.high)).toEqual([0.5])
  })

  it('fails rather than show prices with an implausible labor rate', async () => {
    const api = fakeApi(() => reply([job(0)], { low_cents: 0, high_cents: 0 }))
    await expect(estimate(api)).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('says when the model declines', async () => {
    const api = fakeApi(() => ok(message('', 'refusal')))
    await expect(estimate(api)).rejects.toMatchObject({ kind: 'declined' })
  })
})

const setup = (options: { noEstimator?: boolean; dailyLimit?: number; asked?: number } = {}) => {
  const estimator = controlledPriceEstimator()
  let asked = options.asked ?? 0
  const logged: string[] = []
  const handler = createPriceHandler({
    userFor: async (token) => (token === 'good' ? 'u1' : undefined),
    storeFor: () => ({
      claimQuestion: async (limit) => {
        if (asked >= limit) return false
        asked += 1
        return true
      },
    }),
    reader: options.noEstimator ? undefined : estimator,
    dailyLimit: options.dailyLimit ?? 50,
    log: (m) => void logged.push(m),
  })
  return { handler, estimator, logged, asked: () => asked }
}

const post = (body: unknown, token: string | null = 'good') =>
  new Request('http://localhost/assistant/estimate-prices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  })

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('the estimate-prices endpoint', () => {
  it('answers the estimate, counting it against the daily limit', async () => {
    const { handler, estimator, asked } = setup()
    const response = handler(post(request))
    await settle()
    expect(estimator.calls[0]?.request).toEqual(request)
    const answer = { laborRateCents: { low: 12_000, high: 18_000 }, lines: [] }
    estimator.calls[0]?.resolve(answer)
    const res = await response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(answer)
    expect(asked()).toBe(1)
  })

  it('refuses a request without a valid sign-in', async () => {
    const { handler } = setup()
    expect((await handler(post(request, null))).status).toBe(401)
    expect((await handler(post(request, 'bad'))).status).toBe(401)
  })

  it('refuses a bad ZIP or no lines, before spending anything', async () => {
    const { handler, asked } = setup()
    expect((await handler(post({ ...request, zip: '941' }))).status).toBe(400)
    expect((await handler(post({ ...request, lines: [] }))).status).toBe(400)
    expect(asked()).toBe(0)
  })

  it('says it is unavailable until the API key is set, and shares the daily limit', async () => {
    expect((await setup({ noEstimator: true }).handler(post(request))).status).toBe(503)
    const limited = setup({ dailyLimit: 2, asked: 2 })
    expect((await limited.handler(post(request))).status).toBe(429)
    expect(limited.estimator.calls).toHaveLength(0)
  })

  it('passes on why an estimate failed, logging only faults', async () => {
    const { handler, estimator, logged } = setup()
    const declined = handler(post(request))
    await settle()
    estimator.calls[0]?.reject(new AssistantError('declined'))
    expect((await declined).status).toBe(422)
    const broken = handler(post(request))
    await settle()
    estimator.calls[1]?.reject(new Error('boom'))
    expect((await broken).status).toBe(500)
    expect(logged).toEqual(['Estimating prices failed'])
  })
})
