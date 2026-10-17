import { cancellation, type AnswerEvent } from '@car/core'
import { describe, expect, it } from 'vitest'
import { remoteAssistant } from './assistant'

const URL = 'https://project.supabase.co/functions/v1/assistant'
const request = { vehicleId: 'v1', question: 'Any recalls?' }

/** A streaming response whose body arrives in the given pieces, split anywhere. */
const streamed = (pieces: string[]) => {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

const data = (event: object) => `data: ${JSON.stringify(event)}\n\n`

const setup = (respond: () => Response | Promise<Response>, token: string | null = 'tok') => {
  const sent: { url: string; init: RequestInit | undefined }[] = []
  const assistant = remoteAssistant({
    url: URL,
    accessToken: async () => token ?? undefined,
    fetch: async (url, init) => {
      sent.push({ url: String(url), init })
      return respond()
    },
  })
  const events: AnswerEvent[] = []
  const ask = (signal?: ReturnType<typeof cancellation>['signal']) =>
    assistant.ask(request, (e) => void events.push(e), signal)
  return { ask, events, sent }
}

describe('remoteAssistant', () => {
  it('posts the question with the owner token and streams the answer', async () => {
    const body =
      data({ type: 'conversation', id: 'c1' }) +
      data({ type: 'text', text: 'One ' }) +
      data({ type: 'text', text: 'recall.' }) +
      data({ type: 'source', source: { kind: 'recall', id: '24V1', label: 'Recall 24V1' } }) +
      data({ type: 'done' })
    // Split mid-event and mid-character, as a network might.
    const bytes = body.replace('recall.', 'recall… ')
    const { ask, events, sent } = setup(() =>
      streamed([bytes.slice(0, 7), bytes.slice(7, 61), bytes.slice(61)]),
    )
    await ask()
    expect(sent[0]?.url).toBe(URL)
    expect(sent[0]?.init?.method).toBe('POST')
    expect(new Headers(sent[0]?.init?.headers).get('authorization')).toBe('Bearer tok')
    expect(JSON.parse(String(sent[0]?.init?.body))).toEqual(request)
    expect(events).toEqual([
      { type: 'conversation', id: 'c1' },
      { type: 'text', text: 'One ' },
      { type: 'text', text: 'recall… ' },
      { type: 'source', source: { kind: 'recall', id: '24V1', label: 'Recall 24V1' } },
    ])
  })

  it('fails with the reason the server streams', async () => {
    const { ask } = setup(() =>
      streamed([data({ type: 'text', text: 'Hm' }), data({ type: 'error', kind: 'declined' })]),
    )
    await expect(ask()).rejects.toMatchObject({ kind: 'declined' })
  })

  it('reads refusals before the answer starts from the status code', async () => {
    const cases: [number, string][] = [
      [401, 'signed-out'],
      [404, 'not-found'],
      [429, 'rate-limited'],
      [503, 'unavailable'],
      [502, 'unavailable'],
      [400, 'unknown'],
    ]
    for (const [status, kind] of cases) {
      const { ask } = setup(() => new Response(JSON.stringify({ error: kind }), { status }))
      await expect(ask()).rejects.toMatchObject({ kind })
    }
  })

  it('is offline when the request cannot be sent or the answer is cut off', async () => {
    await expect(
      setup(() => {
        throw new TypeError('Network request failed')
      }).ask(),
    ).rejects.toMatchObject({ kind: 'offline' })
    await expect(
      setup(() => streamed([data({ type: 'text', text: 'Half' })])).ask(),
    ).rejects.toMatchObject({
      kind: 'offline',
    })
  })

  it('does not call the server when signed out', async () => {
    const { ask, sent } = setup(() => streamed([]), null)
    await expect(ask()).rejects.toMatchObject({ kind: 'signed-out' })
    expect(sent).toEqual([])
  })

  it('aborts the request when cancelled', async () => {
    const { signal, cancel } = cancellation()
    const { ask, sent } = setup(() => streamed([data({ type: 'done' })]))
    cancel()
    await ask(signal)
    expect(sent[0]?.init?.signal?.aborted).toBe(true)
  })
})
