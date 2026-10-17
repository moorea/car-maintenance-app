import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AuthUser, Vehicle } from '../../domain/types'
import type { AuthPort, SyncStatus, Unsubscribe, VehicleRepo } from '../../ports'

/**
 * What the app shows at its root: nothing yet while the stored session loads, the sign-in screen,
 * a wait while a new device downloads the owner's data, a prompt to add a car, or the selected car.
 */
export type SessionStatus = 'starting' | 'signed-out' | 'syncing' | 'no-vehicles' | 'ready'

export interface SessionState {
  status: SessionStatus
  user?: AuthUser | undefined
  vehicles: Vehicle[]
  selectedVehicleId?: string | undefined
  /** True while the owner is adding another car from a car's screen. */
  addingCar: boolean
}

export interface SessionActions {
  start: () => void
  selectVehicle: (id: string) => void
  /** Opens "add your car" over the selected car. */
  addCar: () => void
  cancelAddCar: () => void
  /** Closes "add your car" and selects the new car as soon as it shows up in the list. */
  carAdded: (id: string) => void
  signOut: () => Promise<void>
  dispose: () => void
}

export type SessionModel = StoreApi<SessionState & SessionActions>

/** Root model: follows sign-in and the owner's vehicles, and keeps one vehicle selected. */
export const createSessionModel = (deps: {
  auth: AuthPort
  vehicles: VehicleRepo
  sync: SyncStatus
}): SessionModel => {
  let stopAuth: Unsubscribe | undefined
  let stopVehicles: Unsubscribe | undefined
  let stopSync: Unsubscribe | undefined
  // An empty list means "no cars" only once the first sync is done; before that it means
  // "not downloaded yet", and saying "add a car" would invite a duplicate.
  let synced = false
  // Until the first vehicles result arrives the list is just the empty placeholder.
  let vehiclesLoaded = false
  // undefined until the first auth callback; then the signed-in user's id, or null.
  let currentUserId: string | null | undefined
  // A car just added, to select once the vehicle list includes it.
  let justAdded: string | undefined

  return createStore<SessionState & SessionActions>()((set, get) => {
    const showVehicles = (vehicles: Vehicle[]) => {
      vehiclesLoaded = true
      const sorted = [...vehicles].sort((a, b) => a.nickname.localeCompare(b.nickname))
      const added = sorted.find((v) => v.id === justAdded)
      if (added) justAdded = undefined
      const kept = sorted.find((v) => v.id === get().selectedVehicleId)
      const selected = added ?? kept ?? sorted[0]
      set({
        vehicles: sorted,
        selectedVehicleId: selected?.id,
        status: selected ? 'ready' : synced ? 'no-vehicles' : 'syncing',
      })
    }

    const onUser = (user: AuthUser | null) => {
      const id = user?.id ?? null
      if (id === currentUserId) {
        if (user) set({ user })
        return
      }
      currentUserId = id
      stopVehicles?.()
      stopSync?.()
      stopVehicles = undefined
      stopSync = undefined
      synced = false
      vehiclesLoaded = false
      justAdded = undefined
      if (!user) {
        set({
          status: 'signed-out',
          user: undefined,
          vehicles: [],
          selectedVehicleId: undefined,
          addingCar: false,
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

      start: () => {
        if (stopAuth) return
        stopAuth = deps.auth.watchUser(onUser)
      },

      selectVehicle: (id) => {
        if (!get().vehicles.some((v) => v.id === id)) return
        // The owner's own choice wins over a car added earlier that has not shown up yet.
        justAdded = undefined
        set({ selectedVehicleId: id })
      },

      addCar: () => {
        if (get().user) set({ addingCar: true })
      },

      cancelAddCar: () => set({ addingCar: false }),

      carAdded: (id) => {
        justAdded = id
        set({ addingCar: false })
        // The list may already have it; otherwise the next update selects it.
        if (vehiclesLoaded) showVehicles(get().vehicles)
      },

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
        stopAuth = undefined
        stopVehicles = undefined
        stopSync = undefined
        currentUserId = undefined
      },
    }
  })
}
