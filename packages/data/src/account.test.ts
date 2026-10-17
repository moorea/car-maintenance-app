import { AuthError } from '@car/core'
import { describe, expect, it } from 'vitest'
import { supabaseAccount, type RpcResult } from './account'

const setup = (result: RpcResult | Error, options: { eraseFails?: boolean } = {}) => {
  const calls: string[] = []
  const logs: string[] = []
  const account = supabaseAccount({
    deleteOnServer: async () => {
      calls.push('delete')
      if (result instanceof Error) throw result
      return result
    },
    auth: {
      signOut: async () => {
        calls.push('sign out')
        // The server no longer knows the session; supabaseAuth still signs out locally.
        throw new AuthError('unknown', 'session not found')
      },
    },
    eraseLocal: async () => {
      calls.push('erase')
      if (options.eraseFails) throw new Error('disk full')
    },
    log: (m) => logs.push(m),
  })
  return { account, calls, logs }
}

const kindOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (e) {
    return e instanceof AuthError ? e.kind : 'not an AuthError'
  }
  return 'resolved'
}

describe('supabaseAccount', () => {
  it('deletes on the server, then signs out and erases this phone', async () => {
    const { account, calls } = setup({ error: null, status: 204 })
    await account.deleteAccount()
    expect(calls).toEqual(['delete', 'sign out', 'erase'])
  })

  it.each([
    ['a dropped connection', { error: { message: 'FetchError' }, status: 0 }, 'network'],
    ['an unreachable gateway', { error: { message: 'bad gateway' }, status: 502 }, 'network'],
    ['a database error', { error: { message: 'foreign key' }, status: 500 }, 'unknown'],
    ['a refusal', { error: { message: 'not signed in' }, status: 401 }, 'unknown'],
  ] as const)('reports %s and keeps the owner signed in', async (_, result, kind) => {
    const { account, calls } = setup(result)
    expect(await kindOf(account.deleteAccount())).toBe(kind)
    expect(calls).toEqual(['delete'])
  })

  it('reports a request that throws as a connection problem', async () => {
    const { account } = setup(new TypeError('Network request failed'))
    expect(await kindOf(account.deleteAccount())).toBe('network')
  })

  it('still succeeds when erasing this phone fails, since the account is gone', async () => {
    const { account, logs } = setup({ error: null, status: 204 }, { eraseFails: true })
    await account.deleteAccount()
    expect(logs).toEqual([expect.stringMatching(/not erased: Error: disk full/)])
  })
})
