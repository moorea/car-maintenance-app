import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AuthUser, Vehicle } from '../../domain/types'
import type { AuthPort, Unsubscribe, VehicleRepo } from '../../ports'

/**
 * What the app shows at its root: nothing yet while the stored session loads, the sign-in screen,
 * a prompt to add a car, or the selected car.
 */
export type SessionStatus = 'starting' | 'signed-out' | 'no-vehicles' | 'ready'

export interface SessionState {
  status: SessionStatus
  user?: AuthUser | undefined
  vehicles: Vehicle[]
  selectedVehicleId?: string | undefined
}

export interface SessionActions {
  start: () => void
  selectVehicle: (id: string) => void
  signOut: () => Promise<void>
  dispose: () => void
}

export type SessionModel = StoreApi<SessionState & SessionActions>

/** Root model: follows sign-in and the owner's vehicles, and keeps one vehicle selected. */
export const createSessionModel = (deps: {
  auth: AuthPort
  vehicles: VehicleRepo
}): SessionModel => {
  let stopAuth: Unsubscribe | undefined
  let stopVehicles: Unsubscribe | undefined
  // undefined until the first auth callback; then the signed-in user's id, or null.
  let currentUserId: string | null | undefined

  return createStore<SessionState & SessionActions>()((set, get) => {
    const showVehicles = (vehicles: Vehicle[]) => {
      const sorted = [...vehicles].sort((a, b) => a.nickname.localeCompare(b.nickname))
      const kept = sorted.find((v) => v.id === get().selectedVehicleId)
      const selected = kept ?? sorted[0]
      set({
        vehicles: sorted,
        selectedVehicleId: selected?.id,
        status: selected ? 'ready' : 'no-vehicles',
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
      stopVehicles = undefined
      if (!user) {
        set({ status: 'signed-out', user: undefined, vehicles: [], selectedVehicleId: undefined })
        return
      }
      // 'starting' until the vehicles arrive, so no screen flashes in between.
      set({ status: 'starting', user, vehicles: [], selectedVehicleId: undefined })
      stopVehicles = deps.vehicles.watchOwned(user.id, showVehicles)
    }

    return {
      status: 'starting',
      vehicles: [],

      start: () => {
        if (stopAuth) return
        stopAuth = deps.auth.watchUser(onUser)
      },

      selectVehicle: (id) => {
        if (get().vehicles.some((v) => v.id === id)) set({ selectedVehicleId: id })
      },

      signOut: () => deps.auth.signOut(),

      dispose: () => {
        stopAuth?.()
        stopVehicles?.()
        stopAuth = undefined
        stopVehicles = undefined
        currentUserId = undefined
      },
    }
  })
}
