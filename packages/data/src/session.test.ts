import { describe, expect, it } from 'vitest'
import { createSyncSession, type SyncDatabase } from './session'

/** Records the calls a sync session makes, with a scripted upload queue and stored owner. */
const fakeDatabase = (state: { pending?: number; owner?: string } = {}) => {
  const calls: string[] = []
  let owner = state.owner
  let pending = state.pending ?? 0
  const db: SyncDatabase = {
    connect: async () => void calls.push('connect'),
    disconnect: async () => void calls.push('disconnect'),
    clear: async () => {
      calls.push('clear')
      owner = undefined
      pending = 0
    },
    pendingUploads: async () => pending,
    owner: async () => owner,
    setOwner: async (id) => {
      owner = id
    },
  }
  return { db, calls, owner: () => owner }
}

describe('sync session', () => {
  it('cleans up on sign-out even if connecting had failed', async () => {
    const { db, calls } = fakeDatabase()
    const session = createSyncSession(
      {
        ...db,
        connect: async () => {
          throw new Error('offline')
        },
      },
      () => {},
    )
    await expect(session.setUser('a')).rejects.toThrow('offline')
    await session.setUser(null)
    expect(calls).toEqual(['clear'])
  })

  it('connects once however many sign-in events arrive', async () => {
    const { db, calls } = fakeDatabase()
    const session = createSyncSession(db)
    await Promise.all([session.setUser('a'), session.setUser('a')])
    expect(calls).toEqual(['connect'])
  })

  it('clears the local copy on sign-out once everything is uploaded', async () => {
    const { db, calls } = fakeDatabase()
    const session = createSyncSession(db)
    await session.setUser('a')
    await session.setUser(null)
    expect(calls).toEqual(['connect', 'clear'])
  })

  it('keeps changes not yet uploaded when signed out, and resumes for the same user', async () => {
    const { db, calls } = fakeDatabase({ pending: 2, owner: 'a' })
    const logs: string[] = []
    const session = createSyncSession(db, (m) => logs.push(m))
    await session.setUser('a')
    await session.setUser(null)
    await session.setUser('a')
    expect(calls).toEqual(['connect', 'disconnect', 'connect'])
    expect(logs).toEqual([expect.stringMatching(/2 changes not uploaded/)])
  })

  it("deletes another user's copy before connecting as someone new", async () => {
    const { db, calls, owner } = fakeDatabase({ owner: 'a' })
    await createSyncSession(db).setUser('b')
    expect(calls).toEqual(['clear', 'connect'])
    expect(owner()).toBe('b')
  })

  it('switching accounts without signing out clears and reconnects', async () => {
    const { db, calls } = fakeDatabase()
    const session = createSyncSession(db)
    await session.setUser('a')
    await session.setUser('b')
    expect(calls).toEqual(['connect', 'clear', 'connect'])
  })

  it('applies a quick sign-out and sign-in in order', async () => {
    const { db, calls } = fakeDatabase()
    const session = createSyncSession(db)
    await session.setUser('a')
    await Promise.all([session.setUser(null), session.setUser('b')])
    expect(calls).toEqual(['connect', 'clear', 'connect'])
  })

  it('keeps applying auth changes after one fails', async () => {
    const { db, calls } = fakeDatabase()
    let failures = 1
    const flaky = {
      ...db,
      connect: async () => {
        if (failures-- > 0) throw new Error('offline')
        await db.connect()
      },
    }
    const logs: string[] = []
    const session = createSyncSession(flaky, (m) => logs.push(m))
    await expect(session.setUser('a')).rejects.toThrow('offline')
    await session.setUser('a')
    expect(calls).toEqual(['connect'])
    expect(logs).toEqual([expect.stringMatching(/offline/)])
  })

  it('discards changes not yet uploaded once the account is deleted', async () => {
    const { db, calls, owner } = fakeDatabase({ pending: 2, owner: 'a' })
    const session = createSyncSession(db, () => {})
    await session.setUser('a')
    await session.setUser(null)
    await session.discard()
    expect(calls).toEqual(['connect', 'disconnect', 'clear'])
    expect(owner()).toBeUndefined()
  })

  it('stays signed out when the sign-out arrives after a discard', async () => {
    const { db, calls } = fakeDatabase({ pending: 1, owner: 'a' })
    const session = createSyncSession(db, () => {})
    await session.setUser('a')
    await Promise.all([session.discard(), session.setUser(null)])
    expect(calls).toEqual(['connect', 'clear'])
  })

  it('connects again when the owner signs in after a discard', async () => {
    const { db, calls } = fakeDatabase()
    const session = createSyncSession(db)
    await session.setUser('a')
    await session.discard()
    await session.setUser('b')
    expect(calls).toEqual(['connect', 'clear', 'connect'])
  })
})
