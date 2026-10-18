import { describe, expect, it } from 'vitest'
import { attachmentDownloadUrl, supabaseStorage, transferTimeoutMs } from './storage'

interface Sent {
  url: string
  method: string | undefined
  headers: Record<string, string>
  body: unknown
  signal?: AbortSignal
}

/** Answers every request with `status` and `body`, recording what was sent. */
const fakeFetch = (status: number, body: unknown = {}) => {
  const sent: Sent[] = []
  const doFetch = (async (url: string, init: RequestInit = {}) => {
    sent.push({
      url,
      method: init.method,
      headers: init.headers as Record<string, string>,
      body: init.body,
      ...(init.signal ? { signal: init.signal } : {}),
    })
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { doFetch, sent }
}

const offline = (async () => {
  throw new TypeError('Network request failed')
}) as typeof fetch

const project = { url: 'https://p.supabase.co', anonKey: 'anon' }

/** A connection that never answers, until the request is aborted. */
const hanging = (async (_url: string, init: RequestInit = {}) =>
  new Promise<Response>((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error))
  })) as typeof fetch

describe('supabaseStorage', () => {
  it('gives up on an upload with no response in time, as a network failure that is retried', async () => {
    const asked: number[] = []
    const storage = supabaseStorage(
      { ...project, fetch: hanging, timeoutMs: (bytes) => (asked.push(bytes), 20) },
      'jwt',
    )
    expect(await storage.put('u/a1', new Uint8Array(3), 'image/jpeg')).toEqual({
      status: 0,
      message: expect.stringMatching(/No response/),
    })
    expect(await storage.remove('u/a1')).toMatchObject({ status: 0 })
    expect(asked).toEqual([3, 0])
  })

  it('allows a large file more time than a small one', () => {
    expect(transferTimeoutMs(0)).toBe(30_000)
    expect(transferTimeoutMs(25_000_000)).toBe(280_000)
  })

  it('uploads into the attachments bucket as the owner of the token, never replacing a file', async () => {
    const { doFetch, sent } = fakeFetch(200, { Key: 'attachments/u/a1' })
    const bytes = new Uint8Array([1, 2, 3])
    const storage = supabaseStorage({ ...project, fetch: doFetch }, 'jwt')
    expect(await storage.put('u/a1', bytes, 'image/jpeg')).toBeNull()
    expect(sent).toEqual([
      {
        url: 'https://p.supabase.co/storage/v1/object/attachments/u/a1',
        method: 'POST',
        headers: {
          authorization: 'Bearer jwt',
          apikey: 'anon',
          'content-type': 'image/jpeg',
          'x-upsert': 'false',
        },
        body: bytes,
        signal: expect.any(AbortSignal),
      },
    ])
  })

  it.each([
    ['an HTTP 409', 409, { statusCode: '409', error: 'Duplicate', message: 'exists' }],
    ['a 400 that reports 409', 400, { statusCode: '409', error: 'Duplicate', message: 'x' }],
    [
      'a newer error code',
      400,
      { code: 'KeyAlreadyExists', message: 'The resource already exists' },
    ],
  ])('counts a file already uploaded (%s) as uploaded, so a retry succeeds', async (_, s, body) => {
    const { doFetch } = fakeFetch(s, body)
    const storage = supabaseStorage({ ...project, fetch: doFetch }, 'jwt')
    expect(await storage.put('u/a1', new Uint8Array([1]), 'image/jpeg')).toBeNull()
  })

  it('reports the status Storage puts in the body, so the uploader can tell permanent from temporary', async () => {
    const { doFetch } = fakeFetch(400, {
      statusCode: '403',
      error: 'Unauthorized',
      message: 'new row violates row-level security policy',
      code: 'AccessDenied',
    })
    const storage = supabaseStorage({ ...project, fetch: doFetch }, 'jwt')
    expect(await storage.put('x/a1', new Uint8Array([1]), 'image/jpeg')).toEqual({
      status: 403,
      code: 'AccessDenied',
      message: 'new row violates row-level security policy',
    })
  })

  it.each(['"exp" claim timestamp check failed', 'signature verification failed'])(
    'reports a token Storage cannot verify (%s) as 401, so the upload waits for a fresh session',
    async (message) => {
      const { doFetch } = fakeFetch(400, {
        statusCode: '403',
        error: 'Unauthorized',
        message,
        code: 'AccessDenied',
      })
      const storage = supabaseStorage({ ...project, fetch: doFetch }, 'jwt')
      expect((await storage.put('u/a1', new Uint8Array([1]), 'image/jpeg'))?.status).toBe(401)
    },
  )

  it('reports no connection as status 0', async () => {
    const storage = supabaseStorage({ ...project, fetch: offline }, 'jwt')
    expect((await storage.put('u/a1', new Uint8Array([1]), 'image/jpeg'))?.status).toBe(0)
  })

  it('deletes a file by its path', async () => {
    const { doFetch, sent } = fakeFetch(200, [])
    const storage = supabaseStorage({ ...project, fetch: doFetch }, 'jwt')
    expect(await storage.remove('u/a1')).toBeNull()
    expect(sent[0]).toMatchObject({
      url: 'https://p.supabase.co/storage/v1/object/attachments',
      method: 'DELETE',
      body: JSON.stringify({ prefixes: ['u/a1'] }),
    })
  })

  it('counts a missing file as deleted', async () => {
    const { doFetch } = fakeFetch(400, {
      statusCode: '404',
      error: 'not_found',
      message: 'Object not found',
    })
    const storage = supabaseStorage({ ...project, fetch: doFetch }, 'jwt')
    expect(await storage.remove('u/a1')).toBeNull()
  })
})

describe('attachmentDownloadUrl', () => {
  const token = async () => 'jwt'

  it('signs a ten-minute download link for the path', async () => {
    const { doFetch, sent } = fakeFetch(200, {
      signedURL: '/object/sign/attachments/u/a1?token=abc',
    })
    const url = await attachmentDownloadUrl({ ...project, fetch: doFetch, accessToken: token })(
      'u/a1',
    )
    expect(url).toBe('https://p.supabase.co/storage/v1/object/sign/attachments/u/a1?token=abc')
    expect(sent[0]).toMatchObject({
      url: 'https://p.supabase.co/storage/v1/object/sign/attachments/u/a1',
      method: 'POST',
      body: JSON.stringify({ expiresIn: 600 }),
    })
    expect(sent[0]?.headers.authorization).toBe('Bearer jwt')
  })

  it('says the file is offline without a connection', async () => {
    const downloadUrl = attachmentDownloadUrl({ ...project, fetch: offline, accessToken: token })
    await expect(downloadUrl('u/a1')).rejects.toMatchObject({ kind: 'offline' })
  })

  it.each([
    ['HTTP 404', 404, { message: 'not found' }],
    [
      'a 400 that reports 404',
      400,
      { statusCode: '404', error: 'not_found', message: 'Object not found' },
    ],
  ])('says the file is not uploaded yet when Storage has none (%s)', async (_, status, body) => {
    const { doFetch } = fakeFetch(status, body)
    const downloadUrl = attachmentDownloadUrl({ ...project, fetch: doFetch, accessToken: token })
    await expect(downloadUrl('u/a1')).rejects.toMatchObject({ kind: 'not-uploaded' })
  })

  it('reports other failures as unknown', async () => {
    const { doFetch } = fakeFetch(500, { message: 'boom' })
    const downloadUrl = attachmentDownloadUrl({ ...project, fetch: doFetch, accessToken: token })
    await expect(downloadUrl('u/a1')).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('asks nothing of Storage when signed out', async () => {
    const { doFetch, sent } = fakeFetch(200)
    const downloadUrl = attachmentDownloadUrl({
      ...project,
      fetch: doFetch,
      accessToken: async () => undefined,
    })
    await expect(downloadUrl('u/a1')).rejects.toMatchObject({ kind: 'unknown' })
    expect(sent).toEqual([])
  })
})
