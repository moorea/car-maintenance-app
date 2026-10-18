import Anthropic from '@anthropic-ai/sdk'
import { AssistantError, type QuoteLine } from '@car/core'
import { controlledQuoteReader, SAMPLE_PHOTO } from '@car/core/testing'
import { describe, expect, it } from 'vitest'
import { anthropicQuoteReader, createQuoteHandler } from './quotes'

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
  const headers: Headers[] = []
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    headers.push(new Headers(init?.headers))
    return respond()
  }
  const client = new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 })
  return { client, bodies, headers }
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

const read = (api: ReturnType<typeof fakeApi>) =>
  anthropicQuoteReader(api.client, { model: 'claude-opus-5-5' }).read(SAMPLE_PHOTO)

describe('reading a quote photo with Claude', () => {
  it('stops the request when the owner cancels', async () => {
    const api = fakeApi(() => ok(message('{"lines":[]}')))
    const controller = new AbortController()
    controller.abort()
    await expect(
      anthropicQuoteReader(api.client, { model: 'claude-opus-5-5' }).read(
        SAMPLE_PHOTO,
        controller.signal,
      ),
    ).rejects.toThrow(/aborted/)
    expect(api.bodies).toHaveLength(0)
  })

  it('sends the photo and asks for the lines as structured output', async () => {
    const api = fakeApi(() => ok(message('{"lines":[]}')))
    await read(api)
    const body = api.bodies[0] as {
      model: string
      messages: { content: { type: string; source?: unknown }[] }[]
      output_config: { effort: string; format: { type: string } }
      fallbacks: string
    }
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.messages[0]?.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: SAMPLE_PHOTO.base64 },
    })
    expect(body.output_config.effort).toBe('low')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.fallbacks).toBe('default')
    expect(api.headers[0]?.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
  })

  it('returns the lines in order, with prices where the quote shows them', async () => {
    const api = fakeApi(() =>
      ok(
        message(
          JSON.stringify({
            lines: [
              { text: 'Oil & filter', price_cents: 8995 },
              { text: '  Inspect brakes ', price_cents: null },
            ],
          }),
        ),
      ),
    )
    await expect(read(api)).resolves.toEqual<QuoteLine[]>([
      { text: 'Oil & filter', priceCents: 8_995 },
      { text: 'Inspect brakes' },
    ])
  })

  it('drops a blank line or an impossible price instead of failing the whole read', async () => {
    const api = fakeApi(() =>
      ok(
        message(
          JSON.stringify({
            lines: [
              { text: ' ', price_cents: 100 },
              { text: 'Wiper blades', price_cents: -500 },
              { text: 'Cabin filter', price_cents: 49.5 },
            ],
          }),
        ),
      ),
    )
    expect(await read(api)).toEqual([{ text: 'Wiper blades' }, { text: 'Cabin filter' }])
  })

  it('reports a reply that was cut off as a failure to read', async () => {
    const api = fakeApi(() => ok(message('{"lines":[{"text":"Oil', 'max_tokens')))
    await expect(read(api)).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('reports a declined photo as declined', async () => {
    const api = fakeApi(() => ok(message('', 'refusal')))
    await expect(read(api)).rejects.toMatchObject({ kind: 'declined' })
  })

  it('reports an overloaded or failing API as unavailable', async () => {
    const api = fakeApi(
      () =>
        new Response(
          JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'x' } }),
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    await expect(read(api)).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

const setup = (
  options: { noReader?: boolean; dailyLimit?: number; asked?: number; storeDown?: boolean } = {},
) => {
  const reader = controlledQuoteReader()
  let asked = options.asked ?? 0
  const logged: string[] = []
  const handler = createQuoteHandler({
    userFor: async (token) => (token === 'good' ? 'u1' : undefined),
    storeFor: () => ({
      claimQuestion: async (limit) => {
        if (options.storeDown) throw new Error('database down')
        if (asked >= limit) return false
        asked += 1
        return true
      },
    }),
    reader: options.noReader ? undefined : reader,
    dailyLimit: options.dailyLimit ?? 50,
    log: (m) => void logged.push(m),
  })
  return { handler, reader, logged, asked: () => asked }
}

const post = (body: unknown, token: string | null = 'good') =>
  new Request('http://localhost/assistant/read-quote', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** Lets the handler reach the reader. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('the read-quote endpoint', () => {
  it('reads the photo and answers with its lines, counting it against the daily limit', async () => {
    const { handler, reader, asked } = setup()
    const response = handler(post({ photo: SAMPLE_PHOTO }))
    await settle()
    expect(reader.calls[0]?.photo).toEqual(SAMPLE_PHOTO)
    reader.calls[0]?.resolve([{ text: 'Oil change', priceCents: 8_995 }])
    const res = await response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lines: [{ text: 'Oil change', priceCents: 8_995 }] })
    expect(asked()).toBe(1)
  })

  it('refuses a request without a valid sign-in', async () => {
    const { handler } = setup()
    expect((await handler(post({ photo: SAMPLE_PHOTO }, null))).status).toBe(401)
    expect((await handler(post({ photo: SAMPLE_PHOTO }, 'bad'))).status).toBe(401)
  })

  it('refuses a body that is not a supported photo, before spending anything', async () => {
    const { handler, asked } = setup()
    expect((await handler(post('nope'))).status).toBe(400)
    const gif = { photo: { mediaType: 'image/gif', base64: SAMPLE_PHOTO.base64 } }
    expect((await handler(post(gif))).status).toBe(400)
    const notBase64 = { photo: { mediaType: 'image/jpeg', base64: 'not base64!' } }
    expect((await handler(post(notBase64))).status).toBe(400)
    expect(asked()).toBe(0)
  })

  it('says it is unavailable until the API key is set', async () => {
    const { handler } = setup({ noReader: true })
    const res = await handler(post({ photo: SAMPLE_PHOTO }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('shares the assistant’s daily limit', async () => {
    const { handler, reader } = setup({ dailyLimit: 2, asked: 2 })
    expect((await handler(post({ photo: SAMPLE_PHOTO }))).status).toBe(429)
    expect(reader.calls).toHaveLength(0)
  })

  it('passes on why a read failed, logging only faults', async () => {
    const { handler, reader, logged } = setup()
    const declined = handler(post({ photo: SAMPLE_PHOTO }))
    await settle()
    reader.calls[0]?.reject(new AssistantError('declined'))
    expect((await declined).status).toBe(422)
    expect(logged).toEqual([])

    const broken = handler(post({ photo: SAMPLE_PHOTO }))
    await settle()
    reader.calls[1]?.reject(new Error('boom'))
    const res = await broken
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'unknown' })
    expect(logged).toEqual(['Reading a quote failed'])
  })

  it('answers a failure of its own as unknown and logs it', async () => {
    const { handler, logged } = setup({ storeDown: true })
    const res = await handler(post({ photo: SAMPLE_PHOTO }))
    expect(res.status).toBe(500)
    expect(logged).toEqual(['Request for reading a quote failed'])
  })

  it('only takes POST', async () => {
    const { handler } = setup()
    const get = new Request('http://localhost/assistant/read-quote', {
      headers: { authorization: 'Bearer good' },
    })
    expect((await handler(get)).status).toBe(500)
  })
})
