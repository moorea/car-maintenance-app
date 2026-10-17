import { describe, expect, it } from 'vitest'
import { sweepOrphanedFiles } from './sweep'

interface Sent {
  method: string
  url: string
  authorization: string | null
  apikey: string | null
  body: unknown
}

/** A fake Supabase whose bucket holds `orphans` until they are deleted. */
const fakeSupabase = (
  orphans: string[],
  opts: { deletes?: boolean; listStatus?: number; deleteStatus?: number } = {},
) => {
  const left = [...orphans]
  const sent: Sent[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const url = String(input)
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    sent.push({
      method: init?.method ?? 'GET',
      url,
      authorization: headers.get('authorization'),
      apikey: headers.get('apikey'),
      body,
    })
    if (url.endsWith('/rest/v1/rpc/orphaned_files')) {
      if (opts.listStatus) return new Response('{"message":"nope"}', { status: opts.listStatus })
      const max = (body as { max_files: number }).max_files
      return Response.json(left.slice(0, max))
    }
    if (opts.deleteStatus) return new Response('{"message":"nope"}', { status: opts.deleteStatus })
    const prefixes = (body as { prefixes: string[] }).prefixes
    if (opts.deletes === false) return Response.json([])
    for (const name of prefixes) left.splice(left.indexOf(name), 1)
    return Response.json(prefixes.map((name) => ({ name, bucket_id: 'attachments' })))
  }
  return { fetch, sent, left }
}

const options = { url: 'https://db.example/', serviceKey: 'service-key' }

describe('sweepOrphanedFiles', () => {
  it('deletes every orphaned file through the Storage API, as the service role', async () => {
    const supabase = fakeSupabase(['a/1', 'a/2', 'b/3'])

    const result = await sweepOrphanedFiles({ ...options, fetch: supabase.fetch })

    expect(result).toEqual({ deleted: 3, more: false })
    expect(supabase.left).toEqual([])
    expect(supabase.sent[1]).toEqual({
      method: 'DELETE',
      url: 'https://db.example/storage/v1/object/attachments',
      authorization: 'Bearer service-key',
      apikey: 'service-key',
      body: { prefixes: ['a/1', 'a/2', 'b/3'] },
    })
  })

  it('works through more files than one batch holds', async () => {
    const supabase = fakeSupabase(['a/1', 'a/2', 'a/3', 'a/4', 'a/5'])

    const result = await sweepOrphanedFiles({ ...options, fetch: supabase.fetch, batchSize: 2 })

    expect(result).toEqual({ deleted: 5, more: false })
    expect(supabase.sent.filter((s) => s.method === 'DELETE')).toHaveLength(3)
  })

  it('stops after its last round and says more files remain', async () => {
    const supabase = fakeSupabase(['a/1', 'a/2', 'a/3', 'a/4', 'a/5'])

    const result = await sweepOrphanedFiles({
      ...options,
      fetch: supabase.fetch,
      batchSize: 2,
      maxRounds: 2,
    })

    expect(result).toEqual({ deleted: 4, more: true })
    expect(supabase.left).toEqual(['a/5'])
  })

  it('does nothing when no file is orphaned', async () => {
    const supabase = fakeSupabase([])

    expect(await sweepOrphanedFiles({ ...options, fetch: supabase.fetch })).toEqual({
      deleted: 0,
      more: false,
    })
    expect(supabase.sent.map((s) => s.method)).toEqual(['POST'])
  })

  it('fails rather than looping when Storage deletes none of the listed files', async () => {
    const supabase = fakeSupabase(['a/1'], { deletes: false })

    await expect(sweepOrphanedFiles({ ...options, fetch: supabase.fetch })).rejects.toThrow(
      'Storage deleted none of 1 orphaned files',
    )
  })

  it('fails when the files cannot be listed or deleted, so the scheduled run shows red', async () => {
    await expect(
      sweepOrphanedFiles({ ...options, fetch: fakeSupabase(['a/1'], { listStatus: 401 }).fetch }),
    ).rejects.toThrow('Listing orphaned files failed with HTTP 401')
    await expect(
      sweepOrphanedFiles({ ...options, fetch: fakeSupabase(['a/1'], { deleteStatus: 500 }).fetch }),
    ).rejects.toThrow('Deleting files failed with HTTP 500')
  })

  it('fails when the listing is not a list of names', async () => {
    const fetch = async () => Response.json({ hint: 'not a list' })

    await expect(sweepOrphanedFiles({ ...options, fetch })).rejects.toThrow(
      'Listing orphaned files returned',
    )
  })
})
