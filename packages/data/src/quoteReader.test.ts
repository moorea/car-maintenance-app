import { cancellation } from '@car/core'
import { SAMPLE_PHOTO } from '@car/core/testing'
import { describe, expect, it } from 'vitest'
import { remoteOdometerReader, remotePriceEstimator, remoteQuoteReader } from './quoteReader'

const URL = 'https://project.supabase.co/functions/v1/assistant/read-quote'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const setup = (respond: () => Response | Promise<Response>, token: string | null = 'tok') => {
  const sent: { url: string; init: RequestInit | undefined }[] = []
  const reader = remoteQuoteReader({
    url: URL,
    accessToken: async () => token ?? undefined,
    fetch: async (url, init) => {
      sent.push({ url: String(url), init })
      return respond()
    },
  })
  return { reader, sent }
}

describe('remoteQuoteReader', () => {
  it('posts the photo with the owner token and returns the lines', async () => {
    const { reader, sent } = setup(() =>
      json(200, { lines: [{ text: 'Oil change', priceCents: 8_995 }, { text: 'Rotate tires' }] }),
    )
    await expect(reader.read(SAMPLE_PHOTO)).resolves.toEqual([
      { text: 'Oil change', priceCents: 8_995 },
      { text: 'Rotate tires' },
    ])
    expect(sent[0]?.url).toBe(URL)
    expect(new Headers(sent[0]?.init?.headers).get('authorization')).toBe('Bearer tok')
    expect(JSON.parse(String(sent[0]?.init?.body))).toEqual({ photo: SAMPLE_PHOTO })
  })

  it('needs a signed-in owner', async () => {
    const { reader, sent } = setup(() => json(200, { lines: [] }), null)
    await expect(reader.read(SAMPLE_PHOTO)).rejects.toMatchObject({ kind: 'signed-out' })
    expect(sent).toHaveLength(0)
  })

  it('reads a failed request as offline', async () => {
    const { reader } = setup(() => Promise.reject(new TypeError('Network request failed')))
    await expect(reader.read(SAMPLE_PHOTO)).rejects.toMatchObject({ kind: 'offline' })
  })

  it.each([
    [401, 'signed-out'],
    [422, 'declined'],
    [429, 'rate-limited'],
    [503, 'unavailable'],
    [500, 'unknown'],
  ])('maps a %i answer to %s', async (status, kind) => {
    const { reader } = setup(() => json(status, { error: kind }))
    await expect(reader.read(SAMPLE_PHOTO)).rejects.toMatchObject({ kind })
  })

  it('maps a status without a known error to its kind', async () => {
    const { reader } = setup(() => new Response('Bad gateway', { status: 503 }))
    await expect(reader.read(SAMPLE_PHOTO)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('rejects a response that is not a list of lines', async () => {
    const { reader } = setup(() => json(200, { lines: 'nope' }))
    await expect(reader.read(SAMPLE_PHOTO)).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('aborts the request when cancelled', async () => {
    let seen: AbortSignal | undefined
    const reader = remoteQuoteReader({
      url: URL,
      accessToken: async () => 'tok',
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          seen = init?.signal ?? undefined
          seen?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })
    const { signal, cancel } = cancellation()
    const reading = reader.read(SAMPLE_PHOTO, signal)
    await Promise.resolve()
    await Promise.resolve()
    cancel()
    expect(seen?.aborted).toBe(true)
    await expect(reading).rejects.toBeDefined()
  })
})

describe('remoteOdometerReader', () => {
  const odometer = (respond: () => Response) =>
    remoteOdometerReader({
      url: 'https://project.supabase.co/functions/v1/assistant/read-odometer',
      accessToken: async () => 'tok',
      fetch: async () => respond(),
    })

  it('returns the miles read, or nothing when no odometer was found', async () => {
    await expect(odometer(() => json(200, { miles: 36_012 })).read(SAMPLE_PHOTO)).resolves.toBe(
      36_012,
    )
    await expect(
      odometer(() => json(200, { miles: null })).read(SAMPLE_PHOTO),
    ).resolves.toBeUndefined()
  })

  it('rejects an answer that is not whole miles', async () => {
    await expect(
      odometer(() => json(200, { miles: 'lots' })).read(SAMPLE_PHOTO),
    ).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('passes on why the server could not read it', async () => {
    await expect(
      odometer(() => json(429, { error: 'rate-limited' })).read(SAMPLE_PHOTO),
    ).rejects.toMatchObject({ kind: 'rate-limited' })
  })
})

describe('remotePriceEstimator', () => {
  const request = {
    car: { year: 2019, make: 'Honda', model: 'CR-V' },
    zip: '94110',
    lines: [{ index: 0, text: 'Oil change' }],
  }
  const estimator = (respond: () => Response) => {
    const sent: unknown[] = []
    return {
      sent,
      estimator: remotePriceEstimator({
        url: 'https://project.supabase.co/functions/v1/assistant/estimate-prices',
        accessToken: async () => 'tok',
        fetch: async (_url, init) => {
          sent.push(JSON.parse(String(init?.body)))
          return respond()
        },
      }),
    }
  }

  it('posts the request and returns the estimate', async () => {
    const answer = {
      laborRateCents: { low: 12_000, high: 18_000 },
      lines: [
        { index: 0, laborHours: { low: 0.4, high: 0.5 }, partsCents: { low: 3_500, high: 6_500 } },
      ],
    }
    const { estimator: e, sent } = estimator(() => json(200, answer))
    await expect(e.estimate(request)).resolves.toEqual(answer)
    expect(sent).toEqual([request])
  })

  it('rejects an answer that is not an estimate', async () => {
    const { estimator: e } = estimator(() => json(200, { laborRateCents: 'cheap' }))
    await expect(e.estimate(request)).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('passes on why the server could not estimate', async () => {
    const { estimator: e } = estimator(() => json(503, { error: 'unavailable' }))
    await expect(e.estimate(request)).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
