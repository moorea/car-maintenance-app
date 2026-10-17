import type { CommonPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/common'

/** What the sync session needs from the local database. */
export interface SyncDatabase {
  connect(): Promise<void>
  disconnect(): Promise<void>
  /** Disconnects and deletes every local row, including changes not yet uploaded. */
  clear(): Promise<void>
  pendingUploads(): Promise<number>
  /** The user whose data the local copy holds. */
  owner(): Promise<string | undefined>
  setOwner(userId: string): Promise<void>
}

export interface SyncSession {
  /** Call on every auth change with the signed-in user's id, or null when signed out. */
  setUser(userId: string | null): Promise<void>
}

/**
 * Keeps sync in step with sign-in. Changes are applied one at a time in order, so a quick sign-out
 * and sign-in cannot interleave a clear with a connect.
 *
 * - Signing in connects once per user, however many auth events arrive.
 * - Signing out disconnects. The local copy is deleted only once every change has been uploaded;
 *   otherwise it is kept so nothing logged offline is lost if the same user signs back in.
 * - Signing in as someone else first deletes the previous user's copy, so it is never shown to
 *   or uploaded as the new user.
 */
export const createSyncSession = (
  db: SyncDatabase,
  log: (message: string) => void = console.warn,
): SyncSession => {
  // The last auth state fully applied: a user id, null once signed out, undefined at launch.
  let applied: string | null | undefined
  let queue = Promise.resolve()

  const apply = async (userId: string | null) => {
    if (userId === applied) return
    if (userId === null) {
      const pending = await db.pendingUploads()
      if (pending === 0) await db.clear()
      else {
        await db.disconnect()
        log(`Signed out with ${pending} changes not uploaded; keeping them for the next sign-in`)
      }
      applied = null
      return
    }
    const owner = await db.owner()
    if (owner !== undefined && owner !== userId) {
      const pending = await db.pendingUploads()
      if (pending > 0) log(`Discarding ${pending} changes another user made offline on this phone`)
      await db.clear()
    } else if (typeof applied === 'string') {
      await db.disconnect()
    }
    await db.setOwner(userId)
    await db.connect()
    applied = userId
  }

  return {
    setUser: (userId) => {
      const next = queue.then(() => apply(userId))
      // One failed step must not stop later auth changes from being applied.
      queue = next.catch((error: unknown) => log(`Sync session update failed: ${String(error)}`))
      return next
    },
  }
}

const OWNER_KEY = 'owner'

/** Adapts a PowerSync database and connector to the sync session. */
export const powerSyncSessionDatabase = (
  db: CommonPowerSyncDatabase,
  connector: PowerSyncBackendConnector,
): SyncDatabase => ({
  connect: () => db.connect(connector),
  disconnect: () => db.disconnect(),
  clear: () => db.disconnectAndClear(),
  pendingUploads: async () => (await db.getUploadQueueStats()).count,
  owner: async () =>
    (
      await db.getOptional<{ value: string }>('select value from device_state where id = ?', [
        OWNER_KEY,
      ])
    )?.value,
  setOwner: async (userId) => {
    await db.execute('insert or replace into device_state (id, value) values (?, ?)', [
      OWNER_KEY,
      userId,
    ])
  },
})
