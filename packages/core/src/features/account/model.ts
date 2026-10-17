import { createStore, type StoreApi } from 'zustand/vanilla'
import { AuthError } from '../../domain/types'
import type {
  AccountPort,
  AuthPort,
  NotificationPermission,
  Notifier,
  ReminderSettingsRepo,
  Unsubscribe,
} from '../../ports'

/**
 * - `ready`: showing the account.
 * - `confirming-delete`: asking the owner to confirm deleting their account.
 * - `deleting`, `signing-out`: waiting for that to finish; nothing else can be started.
 */
export type AccountStatus = 'ready' | 'confirming-delete' | 'deleting' | 'signing-out'

/**
 * Whether service reminders are on, as the account page summarises it. `blocked` means the
 * phone's settings do not allow this app's notifications.
 */
export type RemindersSummary = 'loading' | 'on' | 'off' | 'blocked'

export interface AccountState {
  status: AccountStatus
  /** The address the owner signs in with. */
  email?: string | undefined
  reminders: RemindersSummary
  /** Why the account was not deleted, shown until the owner tries again or cancels. */
  error?: string | undefined
}

export interface AccountActions {
  start: () => void
  /** Signs out of this phone. Always ends signed out, even offline. */
  signOut: () => Promise<void>
  /** Asks the owner to confirm before anything is deleted. */
  askToDelete: () => void
  cancelDelete: () => void
  /** Deletes the account for good. On success the owner is signed out. */
  confirmDelete: () => Promise<void>
  dispose: () => void
}

export type AccountModel = StoreApi<AccountState & AccountActions>

export interface AccountDeps {
  auth: Pick<AuthPort, 'watchUser' | 'signOut'>
  account: AccountPort
  notifier: Pick<Notifier, 'permission'>
  reminderSettings: ReminderSettingsRepo
}

const DELETE_FAILED: Record<'network' | 'other', string> = {
  // The answer may have been lost after the server deleted it, so this cannot say it was not.
  // Trying again is safe either way.
  network: "Couldn't confirm your account was deleted. Check your connection and try again.",
  other: 'Something went wrong, so your account was not deleted. Please try again.',
}

/** Screen model for the account page: who is signed in, reminders, signing out and deleting. */
export const createAccountModel = (deps: AccountDeps): AccountModel => {
  let stops: Unsubscribe[] = []
  let enabled: boolean | undefined
  let permission: NotificationPermission | undefined
  // Counts permission checks, so a slow one never overwrites a later answer.
  let checks = 0

  return createStore<AccountState & AccountActions>()((set, get) => {
    const showReminders = () => {
      if (enabled === undefined || permission === undefined) return
      set({
        reminders:
          permission === 'denied' ? 'blocked' : enabled && permission === 'granted' ? 'on' : 'off',
      })
    }

    const checkPermission = async () => {
      const at = ++checks
      let next: NotificationPermission
      try {
        next = await deps.notifier.permission()
      } catch {
        // Unknown reads as not yet asked, which shows reminders as off.
        next = 'undetermined'
      }
      if (at !== checks) return
      permission = next
      showReminders()
    }

    return {
      status: 'ready',
      reminders: 'loading',

      start: () => {
        if (stops.length > 0) return
        stops = [
          deps.auth.watchUser((user) => set({ email: user?.email })),
          deps.reminderSettings.watch((s) => {
            enabled = s.enabled
            // Turning reminders on may have just asked for permission.
            void checkPermission()
          }),
        ]
      },

      signOut: async () => {
        if (get().status !== 'ready') return
        set({ status: 'signing-out', error: undefined })
        try {
          await deps.auth.signOut()
        } catch {
          // Signed out on this phone regardless, which is what the owner asked for.
        } finally {
          set({ status: 'ready' })
        }
      },

      askToDelete: () => {
        if (get().status === 'ready') set({ status: 'confirming-delete', error: undefined })
      },

      cancelDelete: () => {
        if (get().status === 'confirming-delete') set({ status: 'ready', error: undefined })
      },

      confirmDelete: async () => {
        if (get().status !== 'confirming-delete') return
        set({ status: 'deleting', error: undefined })
        try {
          await deps.account.deleteAccount()
          // Signed out now, so the app leaves this screen.
          set({ status: 'ready' })
        } catch (e) {
          // Still confirming, so trying again is one tap.
          set({
            status: 'confirming-delete',
            error:
              DELETE_FAILED[e instanceof AuthError && e.kind === 'network' ? 'network' : 'other'],
          })
        }
      },

      dispose: () => {
        for (const stop of stops) stop()
        stops = []
      },
    }
  })
}
