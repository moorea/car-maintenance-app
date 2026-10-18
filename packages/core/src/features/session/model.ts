import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AuthUser, Vehicle } from '../../domain/types'
import type { AuthPort, Notifier, SyncStatus, Unsubscribe, VehicleRepo } from '../../ports'

/**
 * What the app shows at its root: nothing yet while the stored session loads, the sign-in screen,
 * a wait while a new device downloads the owner's data, a prompt to add a car, or the selected car.
 */
export type SessionStatus = 'starting' | 'signed-out' | 'syncing' | 'no-vehicles' | 'ready'

/**
 * The app's main sections: one per tab (the garage, the service log, the car and the assistant),
 * plus the reminder settings and the owner's account, opened from the garage, the owner's data
 * (export and import), opened from the account, and the quote checker, the check-engine code
 * lookup, how the car is driven, the car's warranties, its fuel and running costs, and its
 * registration, inspection and insurance dates, opened from the car.
 */
export type AppTab =
  | 'garage'
  | 'log'
  | 'car'
  | 'ask'
  | 'reminders'
  | 'account'
  | 'data'
  | 'quote'
  | 'warranty'
  | 'fuel'
  | 'codes'
  | 'driving'
  | 'renewals'

export interface SessionState {
  status: SessionStatus
  user?: AuthUser | undefined
  vehicles: Vehicle[]
  selectedVehicleId?: string | undefined
  /** True while the owner is adding another car from a car's screen. */
  addingCar: boolean
  /**
   * The car just added, until reminders have been offered for it (or needed no offer). The offer
   * waits until that car is the selected one, so it names the right car.
   */
  offerRemindersFor?: string | undefined
  /** The open tab. Signing in opens the garage. */
  tab: AppTab
  /**
   * Set when the owner asked to log a service from elsewhere (such as "Log it done"), until the
   * log has opened its form. `seq` changes with every request. `earlier` when the service was
   * done some time ago, so the form asks for its date rather than assume today.
   */
  logRequest?:
    { itemId?: string | undefined; earlier?: boolean | undefined; seq: number } | undefined
}

export interface SessionActions {
  start: () => void
  selectVehicle: (id: string) => void
  openTab: (tab: AppTab) => void
  /**
   * Leaves Ask, the quote checker or the code lookup for where the owner opened it from, such as the quote a
   * question was about; the garage if there is nowhere to go back to.
   */
  back: () => void
  /**
   * The system back gesture (Android): closes "add your car", or leaves the open page for the one
   * its own back button goes to. False when there is nowhere to go back to, so the app can close.
   */
  systemBack: () => boolean
  /**
   * Opens the service log with its form, for a scheduled task if one is given, and with no date
   * when the service was done `earlier` (such as filling in a new car's history).
   */
  logService: (itemId?: string, options?: { earlier?: boolean }) => void
  /** The log has opened its form for the request, so it is not opened again. */
  logRequestHandled: () => void
  /** Selects a car and opens its page. */
  openCar: (id: string) => void
  /** Opens "add your car" over the selected car. */
  addCar: () => void
  cancelAddCar: () => void
  /**
   * Closes "add your car", offers reminders, and selects the new car as soon as it shows up in the
   * list.
   */
  carAdded: (id: string) => void
  /** Reminders were offered, or needed no offer, after a car was added. */
  remindersOffered: () => void
  signOut: () => Promise<void>
  dispose: () => void
}

export type SessionModel = StoreApi<SessionState & SessionActions>

/** The page each page's back button leaves for, where that is not the garage. */
const PARENT: Partial<Record<AppTab, AppTab>> = {
  fuel: 'car',
  warranty: 'car',
  driving: 'car',
  renewals: 'car',
  data: 'account',
}

/** Root model: follows sign-in and the owner's vehicles, and keeps one vehicle selected. */
export const createSessionModel = (deps: {
  auth: AuthPort
  vehicles: VehicleRepo
  sync: SyncStatus
  /** When given, tapping a reminder opens the car it is about. */
  notifier?: Pick<Notifier, 'watchOpened'>
}): SessionModel => {
  let stopAuth: Unsubscribe | undefined
  let stopVehicles: Unsubscribe | undefined
  let stopSync: Unsubscribe | undefined
  let stopTaps: Unsubscribe | undefined
  // A car whose reminder was tapped, to open once the owner's cars have loaded.
  let tapped: string | undefined
  // An empty list means "no cars" only once the first sync is done; before that it means
  // "not downloaded yet", and saying "add a car" would invite a duplicate.
  let synced = false
  // Until the first vehicles result arrives the list is just the empty placeholder.
  let vehiclesLoaded = false
  // undefined until the first auth callback; then the signed-in user's id, or null.
  let currentUserId: string | null | undefined
  // Counts requests to log a service, so each one differs from the last even once handled.
  let logRequests = 0
  // A car just added, to select once the vehicle list includes it.
  let justAdded: string | undefined
  // The tabs Ask, the quote checker and the code lookup were opened from, newest last, for going back.
  let openedFrom: AppTab[] = []

  return createStore<SessionState & SessionActions>()((set, get) => {
    const showVehicles = (vehicles: Vehicle[]) => {
      vehiclesLoaded = true
      const sorted = [...vehicles].sort((a, b) => a.nickname.localeCompare(b.nickname))
      const opened = sorted.find((v) => v.id === tapped)
      // A tapped car not here once everything has synced is gone, or another account's.
      if (opened || synced) tapped = undefined
      // The tap is the newest thing the owner asked for, so a car added earlier gives way to it.
      if (opened) {
        justAdded = undefined
        openedFrom = []
      }
      const added = sorted.find((v) => v.id === justAdded)
      if (added) justAdded = undefined
      const kept = sorted.find((v) => v.id === get().selectedVehicleId)
      const selected = opened ?? added ?? kept ?? sorted[0]
      set({
        vehicles: sorted,
        selectedVehicleId: selected?.id,
        status: selected ? 'ready' : synced ? 'no-vehicles' : 'syncing',
        // A tapped reminder opens that car's page.
        ...(opened && { addingCar: false, tab: 'car' as const }),
      })
    }

    const onUser = (user: AuthUser | null) => {
      const id = user?.id ?? null
      if (id === currentUserId) {
        if (user) set({ user })
        return
      }
      currentUserId = id
      openedFrom = []
      stopVehicles?.()
      stopSync?.()
      stopVehicles = undefined
      stopSync = undefined
      synced = false
      vehiclesLoaded = false
      justAdded = undefined
      if (!user) {
        tapped = undefined
        set({
          status: 'signed-out',
          user: undefined,
          vehicles: [],
          selectedVehicleId: undefined,
          addingCar: false,
          offerRemindersFor: undefined,
          tab: 'garage',
        })
        return
      }
      // 'starting' until the vehicles arrive, so no screen flashes in between.
      set({
        status: 'starting',
        user,
        vehicles: [],
        selectedVehicleId: undefined,
        addingCar: false,
        offerRemindersFor: undefined,
        tab: 'garage',
      })
      stopVehicles = deps.vehicles.watchOwned(user.id, showVehicles)
      stopSync = deps.sync.onFirstSync(user.id, () => {
        synced = true
        if (vehiclesLoaded) showVehicles(get().vehicles)
      })
    }

    return {
      status: 'starting',
      vehicles: [],
      addingCar: false,
      tab: 'garage',

      start: () => {
        if (stopAuth) return
        stopTaps = deps.notifier?.watchOpened((vehicleId) => {
          // Signed out: the reminder belonged to whoever was signed in, so it opens nothing.
          if (currentUserId === null) return
          tapped = vehicleId
          if (vehiclesLoaded) showVehicles(get().vehicles)
        })
        stopAuth = deps.auth.watchUser(onUser)
      },

      selectVehicle: (id) => {
        if (!get().vehicles.some((v) => v.id === id)) return
        // The owner's own choice wins over a car added or tapped earlier that has not shown up yet.
        justAdded = undefined
        tapped = undefined
        set({ selectedVehicleId: id })
      },

      openTab: (tab) => {
        if (tab === 'ask' || tab === 'quote' || tab === 'codes') {
          if (tab !== get().tab) openedFrom.push(get().tab)
        } else openedFrom = []
        set({ tab, logRequest: undefined })
      },

      back: () => set({ tab: openedFrom.pop() ?? 'garage', logRequest: undefined }),

      systemBack: () => {
        const { status, tab, addingCar } = get()
        if (status === 'starting' || status === 'signed-out') return false
        // Without a ready car, "add your car" is the first screen rather than a page over one.
        if (addingCar && status === 'ready') {
          set({ addingCar: false })
          return true
        }
        if (tab === 'garage') return false
        if (tab === 'ask' || tab === 'quote' || tab === 'codes') get().back()
        else get().openTab(PARENT[tab] ?? 'garage')
        return true
      },

      logService: (itemId, options) => {
        openedFrom = []
        set({
          tab: 'log',
          logRequest: { itemId, earlier: options?.earlier, seq: ++logRequests },
        })
      },

      logRequestHandled: () => set({ logRequest: undefined }),

      openCar: (id) => {
        get().selectVehicle(id)
        if (get().selectedVehicleId === id) {
          openedFrom = []
          set({ tab: 'car' })
        }
      },

      addCar: () => {
        if (!get().user) return
        tapped = undefined
        set({ addingCar: true })
      },

      cancelAddCar: () => set({ addingCar: false }),

      carAdded: (id) => {
        justAdded = id
        tapped = undefined
        set({ addingCar: false, offerRemindersFor: id })
        // The list may already have it; otherwise the next update selects it.
        if (vehiclesLoaded) showVehicles(get().vehicles)
      },

      remindersOffered: () => set({ offerRemindersFor: undefined }),

      // A failure to revoke the session on the server still signs out locally, which is what
      // the owner asked for, so it is not reported.
      signOut: async () => {
        try {
          await deps.auth.signOut()
        } catch {
          // Signed out locally regardless.
        }
      },

      dispose: () => {
        stopAuth?.()
        stopVehicles?.()
        stopSync?.()
        stopTaps?.()
        stopAuth = undefined
        stopTaps = undefined
        stopVehicles = undefined
        stopSync = undefined
        currentUserId = undefined
      },
    }
  })
}
