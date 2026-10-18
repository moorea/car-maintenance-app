import Anthropic from '@anthropic-ai/sdk'
import { AssistantError } from '@car/core'
import { controlledOdometerReader, SAMPLE_PHOTO } from '@car/core/testing'
import { describe, expect, it } from 'vitest'
import { anthropicOdometerReader, createOdometerHandler } from './odometer'

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

const fakeApi = (reply: unknown, stopReason?: string) => {
  const bodies: Record<string, unknown>[] = []
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify(message(JSON.stringify(reply), stopReason)), {
      headers: { 'content-type': 'application/json' },
    })
  }
  return { client: new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 }), bodies }
}

const read = (api: ReturnType<typeof fakeApi>) =>
  anthropicOdometerReader(api.client, { model: 'claude-opus-5-5' }).read(SAMPLE_PHOTO)

describe('reading an odometer photo with Claude', () => {
  it('sends the photo and asks for the reading as structured output', async () => {
    const api = fakeApi({ odometer: 36_012, unit: 'mi' })
    expect(await read(api)).toBe(36_012)
    const body = api.bodies[0] as {
      messages: { content: { type: string; source?: unknown }[] }[]
      output_config: { effort: string; format: { type: string } }
    }
    expect(body.messages[0]?.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: SAMPLE_PHOTO.base64 },
    })
    expect(body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } })
  })

  it('converts an odometer that reads kilometres to miles', async () => {
    expect(await read(fakeApi({ odometer: 100_000, unit: 'km' }))).toBe(62_137)
  })

  it('finds nothing when no odometer could be read, or the number is impossible', async () => {
    expect(await read(fakeApi({ odometer: null, unit: 'mi' }))).toBeUndefined()
    expect(await read(fakeApi({ odometer: -5, unit: 'mi' }))).toBeUndefined()
    expect(await read(fakeApi({ odometer: 12.5, unit: 'mi' }))).toBeUndefined()
    expect(await read(fakeApi({ odometer: 9_000_000, unit: 'mi' }))).toBeUndefined()
  })

  it('reports a declined photo as declined', async () => {
    await expect(read(fakeApi('', 'refusal'))).rejects.toMatchObject({ kind: 'declined' })
  })
})

const setup = (options: { noReader?: boolean; asked?: number } = {}) => {
  const reader = controlledOdometerReader()
  let asked = options.asked ?? 0
  const logged: string[] = []
  const handler = createOdometerHandler({
    userFor: async (token) => (token === 'good' ? 'u1' : undefined),
    storeFor: () => ({
      claimQuestion: async (limit) => {
        if (asked >= limit) return false
        asked += 1
        return true
      },
    }),
    reader: options.noReader ? undefined : reader,
    dailyLimit: 50,
    log: (m) => void logged.push(m),
  })
  return { handler, reader, logged, asked: () => asked }
}

const post = (body: unknown, token: string | null = 'good') =>
  new Request('http://localhost/assistant/read-odometer', {
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

describe('the read-odometer endpoint', () => {
  it('answers with the miles read, counting it against the daily limit', async () => {
    const { handler, reader, asked } = setup()
    const response = handler(post({ photo: SAMPLE_PHOTO }))
    await settle()
    reader.calls[0]?.resolve(36_012)
    const res = await response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ miles: 36_012 })
    expect(asked()).toBe(1)
  })

  it('answers null miles when the photo shows no odometer', async () => {
    const { handler, reader } = setup()
    const response = handler(post({ photo: SAMPLE_PHOTO }))
    await settle()
    reader.calls[0]?.resolve(undefined)
    expect(await (await response).json()).toEqual({ miles: null })
  })

  it('refuses a request without a valid sign-in or a photo, before spending anything', async () => {
    const { handler, asked } = setup()
    expect((await handler(post({ photo: SAMPLE_PHOTO }, null))).status).toBe(401)
    expect((await handler(post({ photo: 'nope' }))).status).toBe(400)
    expect(asked()).toBe(0)
  })

  it('shares the assistant’s daily limit and says when the key is not set', async () => {
    expect((await setup({ asked: 50 }).handler(post({ photo: SAMPLE_PHOTO }))).status).toBe(429)
    expect((await setup({ noReader: true }).handler(post({ photo: SAMPLE_PHOTO }))).status).toBe(
      503,
    )
  })

  it('passes on why a read failed, logging only faults', async () => {
    const { handler, reader, logged } = setup()
    const declined = handler(post({ photo: SAMPLE_PHOTO }))
    await settle()
    reader.calls[0]?.reject(new AssistantError('declined'))
    expect((await declined).status).toBe(422)
    const broken = handler(post({ photo: SAMPLE_PHOTO }))
    await settle()
    reader.calls[1]?.reject(new Error('boom'))
    expect((await broken).status).toBe(500)
    expect(logged).toEqual(['Reading an odometer failed'])
  })
})
