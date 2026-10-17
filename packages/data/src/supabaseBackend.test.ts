import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { supabaseBackend } from './connector'

interface Sent {
  method: string
  url: URL
  authorization: string | null
  prefer: string | null
  body: unknown
}

/** A Supabase client whose requests are recorded and answered with `status` and `body`. */
const recordingClient = (status = 201, body: unknown = null) => {
  const sent: Sent[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    sent.push({
      method: init?.method ?? 'GET',
      url: new URL(input instanceof Request ? input.url : String(input)),
      authorization: headers.get('Authorization'),
      prefer: headers.get('Prefer'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    })
    return new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const supabase = createClient('https://db.example', 'anon-key', {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { supabase, sent }
}

const storage = { url: 'https://db.example', anonKey: 'anon-key' }

describe('supabaseBackend', () => {
  it('sends every write as the user whose token it was given, not the anon key', async () => {
    const { supabase, sent } = recordingClient(204)
    const backend = supabaseBackend(supabase, storage, 'user-jwt')
    await backend.insert('vehicles', { id: 'v1' })
    await backend.upsert('vehicles', { id: 'v1' })
    await backend.update('vehicles', 'v1', {})
    await backend.remove('vehicles', 'v1')
    expect(sent.map((s) => s.authorization)).toEqual([
      'Bearer user-jwt',
      'Bearer user-jwt',
      'Bearer user-jwt',
      'Bearer user-jwt',
    ])
  })

  it('inserts without overwriting a row that already exists', async () => {
    const { supabase, sent } = recordingClient(201)
    expect(
      await supabaseBackend(supabase, storage, 'jwt').insert('vehicles', { id: 'v1' }),
    ).toBeNull()
    expect(sent[0]).toMatchObject({ method: 'POST', body: { id: 'v1' } })
    expect(sent[0]?.url.pathname).toBe('/rest/v1/vehicles')
    expect(sent[0]?.prefer).toContain('resolution=ignore-duplicates')
  })

  it('upserts by replacing a row that already exists', async () => {
    const { supabase, sent } = recordingClient(201)
    expect(
      await supabaseBackend(supabase, storage, 'jwt').upsert('vehicles', { id: 'v1' }),
    ).toBeNull()
    expect(sent[0]?.prefer).toContain('resolution=merge-duplicates')
  })

  it('updates only the row with the given id', async () => {
    const { supabase, sent } = recordingClient(200, [{ id: 'v1' }])
    const backend = supabaseBackend(supabase, storage, 'jwt')
    expect(await backend.update('vehicles', 'v1', { nickname: 'Blue' })).toBeNull()
    expect(sent[0]).toMatchObject({ method: 'PATCH', body: { nickname: 'Blue' } })
    expect(sent[0]?.url.searchParams.get('id')).toBe('eq.v1')
  })

  it('reports an update that row-level security filtered to no rows as not found', async () => {
    const { supabase } = recordingClient(200, [])
    expect(await supabaseBackend(supabase, storage, 'jwt').update('vehicles', 'v1', {})).toEqual({
      status: 404,
      message: 'No vehicles row v1 could be updated',
    })
  })

  it('deletes only the row with the given id', async () => {
    const { supabase, sent } = recordingClient(204)
    expect(await supabaseBackend(supabase, storage, 'jwt').remove('vehicles', 'v1')).toBeNull()
    expect(sent[0]?.method).toBe('DELETE')
    expect(sent[0]?.url.searchParams.get('id')).toBe('eq.v1')
  })

  it('passes on the code, status and message of a refused write', async () => {
    const { supabase } = recordingClient(403, {
      code: '42501',
      message: 'new row violates row-level security policy',
    })
    const backend = supabaseBackend(supabase, storage, 'jwt')
    const refused = {
      code: '42501',
      status: 403,
      message: 'new row violates row-level security policy',
    }
    expect(await backend.insert('vehicles', { id: 'v1' })).toEqual(refused)
    expect(await backend.update('vehicles', 'v1', {})).toEqual(refused)
    expect(await backend.remove('vehicles', 'v1')).toEqual(refused)
  })
})
