import Anthropic from '@anthropic-ai/sdk'
import { cancellation, type ModelEvent, type ModelRequest } from '@car/core'
import { describe, expect, it } from 'vitest'
import { anthropicModel } from './anthropic'

const sse = (events: object[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('')

/** The stream the API sends for an answer: text, a citation, and how it stopped. */
const answerStream = (stopReason: string) =>
  sse([
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Every ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '10,000 mi' } },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'citations_delta',
        citation: {
          type: 'char_location',
          cited_text: 'every 10,000 mi',
          document_index: 1,
          document_title: 'Schedule: Oil change',
          start_char_index: 0,
          end_char_index: 15,
        },
      },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ])

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

const streaming = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/event-stream' } })

const request: ModelRequest = {
  system: 'Answer from the documents.',
  documents: [
    { title: 'The car', text: 'A 2021 Toyota RAV4.' },
    { title: 'Schedule: Oil change', text: 'Oil change: every 10,000 mi.' },
  ],
  turns: [
    { role: 'user', text: 'Hi' },
    { role: 'assistant', text: 'Hello' },
    { role: 'user', text: 'When is the oil due?' },
  ],
}

const run = async (api: ReturnType<typeof fakeApi>) => {
  const events: ModelEvent[] = []
  const stop = await anthropicModel(api.client, { model: 'claude-opus-5-5' }).stream(
    request,
    (e) => void events.push(e),
  )
  return { events, stop }
}

describe('anthropicModel', () => {
  it('streams text and citations by document', async () => {
    const api = fakeApi(() => streaming(answerStream('end_turn')))
    expect(await run(api)).toEqual({
      events: [
        { type: 'text', text: 'Every ' },
        { type: 'text', text: '10,000 mi' },
        { type: 'citation', documentIndex: 1 },
      ],
      stop: 'end',
    })
  })

  it('starts the answer over when a fallback model takes over partway', async () => {
    const declined = sse([
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'I won' } },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'fallback',
          from: { model: 'claude-opus-5-5' },
          to: { model: 'claude-fallback' },
          trigger: { type: 'refusal' },
        },
      },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Every' } },
      { type: 'content_block_stop', index: 2 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      },
      { type: 'message_stop' },
    ])
    const api = fakeApi(() => streaming(declined))
    expect((await run(api)).events).toEqual([
      { type: 'text', text: 'I won' },
      { type: 'reset' },
      { type: 'text', text: 'Every' },
    ])
  })

  it('sends each fact as a citable document ahead of the first question', async () => {
    const api = fakeApi(() => streaming(answerStream('end_turn')))
    await run(api)
    const body = api.bodies[0]
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'Answer from the documents.',
      fallbacks: 'default',
      output_config: { effort: 'low' },
      stream: true,
    })
    expect(body?.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'text', media_type: 'text/plain', data: 'A 2021 Toyota RAV4.' },
            title: 'The car',
            citations: { enabled: true },
          },
          {
            type: 'document',
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: 'Oil change: every 10,000 mi.',
            },
            title: 'Schedule: Oil change',
            citations: { enabled: true },
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: 'Hi' },
        ],
      },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'When is the oil due?' },
    ])
    expect(api.headers[0]?.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
  })

  it('reports a refusal as declined and a cut-off answer as max-tokens', async () => {
    expect((await run(fakeApi(() => streaming(answerStream('refusal'))))).stop).toBe('declined')
    expect((await run(fakeApi(() => streaming(answerStream('max_tokens'))))).stop).toBe(
      'max-tokens',
    )
  })

  it('reads an overloaded or misconfigured API as unavailable', async () => {
    const overloaded = fakeApi(
      () =>
        new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } }), {
          status: 529,
        }),
    )
    await expect(run(overloaded)).rejects.toMatchObject({ kind: 'unavailable' })
    const badKey = fakeApi(
      () =>
        new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error' } }), {
          status: 401,
        }),
    )
    await expect(run(badKey)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('does not call the API for a conversation that starts with an answer', async () => {
    const api = fakeApi(() => streaming(answerStream('end_turn')))
    await expect(
      anthropicModel(api.client, { model: 'm' }).stream(
        { ...request, turns: [{ role: 'assistant', text: 'Hi' }] },
        () => {},
      ),
    ).rejects.toThrow('must start with a question')
    expect(api.bodies).toEqual([])
  })

  it('aborts the request when cancelled', async () => {
    let aborted: AbortSignal | undefined
    const client = new Anthropic({
      apiKey: 'test',
      maxRetries: 0,
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        aborted = init?.signal ?? undefined
        return streaming(answerStream('end_turn'))
      },
    })
    const { signal, cancel } = cancellation()
    const events: ModelEvent[] = []
    const answer = anthropicModel(client, { model: 'm' }).stream(
      request,
      (e) => {
        events.push(e)
        cancel()
      },
      signal,
    )
    await answer.catch(() => {})
    expect(aborted?.aborted).toBe(true)
  })
})
