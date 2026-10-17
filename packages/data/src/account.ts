import { AuthError, type AccountPort, type AuthPort } from '@car/core'

/** What a Supabase RPC call resolves with; supabase-js reports failures here rather than throwing. */
export interface RpcResult {
  error: { message: string } | null
  /** The HTTP status, or 0 when the request never reached the server. */
  status: number
}

/**
 * Account deletion through the `delete_account` database function, which deletes the auth user
 * and, by cascade, all their data (see the migration). Once the server has deleted it, the phone
 * signs out and erases its copy; a failure there is logged rather than thrown, since the account
 * is already gone and the owner must not be told it was not deleted.
 */
export const supabaseAccount = (deps: {
  /** Calls the `delete_account` function as the signed-in owner. */
  deleteOnServer: () => PromiseLike<RpcResult>
  auth: Pick<AuthPort, 'signOut'>
  /** Erases this phone's copy of the owner's data, including changes not uploaded yet. */
  eraseLocal: () => Promise<void>
  log?: (message: string) => void
}): AccountPort => {
  const log = deps.log ?? console.warn
  return {
    deleteAccount: async () => {
      let result: RpcResult
      try {
        result = await deps.deleteOnServer()
      } catch (e) {
        throw new AuthError('network', String(e))
      }
      const { error, status } = result
      // Only an unreachable server or gateway is a connection problem; a 500 is the database
      // refusing, which trying again will not fix.
      if (error)
        throw new AuthError(
          status === 0 || status === 502 || status === 503 || status === 504
            ? 'network'
            : 'unknown',
          error.message,
        )
      try {
        // The server has already ended the session, so this only signs out locally.
        await deps.auth.signOut()
      } catch {
        // supabaseAuth signs out locally even when the server call fails.
      }
      try {
        await deps.eraseLocal()
      } catch (e) {
        log(`Account deleted but this phone's copy was not erased: ${String(e)}`)
      }
    },
  }
}
