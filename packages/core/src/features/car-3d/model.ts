import { createStore, type StoreApi } from 'zustand/vanilla'
import { shows3dCar, type PhoneFor3d } from '../../domain/appearance'
import type { DevicePreferencesRepo, PhoneDisplay, Unsubscribe } from '../../ports'

export interface Car3dState {
  /** `loading` until the choice and the phone's settings are both known. */
  status: 'loading' | 'ready'
  /** Whether the Car screen draws the car in 3D on this phone, or a still side view. */
  on: boolean
  /** Why the 3D car is off without the owner having chosen it, for the setting's note. */
  offBecause?: 'reduce-motion' | 'low-power' | 'slow-phone' | undefined
  /** Why the last change did not save. Cleared by the next change. */
  error?: string | undefined
}

export interface Car3dActions {
  start: () => void
  /** Saves the owner's choice for this phone, overriding what the phone would pick. */
  setOn: (on: boolean) => Promise<void>
  dispose: () => void
}

export type Car3dModel = StoreApi<Car3dState & Car3dActions>

export interface Car3dDeps {
  preferences: DevicePreferencesRepo
  phone: PhoneDisplay
}

const reasonOff = (phone: PhoneFor3d): Car3dState['offBecause'] =>
  !phone.capable
    ? 'slow-phone'
    : phone.reduceMotion
      ? 'reduce-motion'
      : phone.lowPower
        ? 'low-power'
        : undefined

/**
 * Whether to draw the owner's car in 3D on this phone (ADR 0022), for the Car screen and the
 * setting in Account. The owner's choice wins; until they make one, the phone's settings decide.
 */
export const createCar3dModel = (deps: Car3dDeps): Car3dModel => {
  let stops: Unsubscribe[] = []
  let choice: boolean | null | undefined
  let phone: PhoneFor3d | undefined

  return createStore<Car3dState & Car3dActions>()((set) => {
    const show = () => {
      if (choice === undefined || phone === undefined) return
      const on = shows3dCar(choice, phone)
      set({
        status: 'ready',
        on,
        offBecause: on || choice === false ? undefined : reasonOff(phone),
      })
    }

    return {
      status: 'loading',
      on: false,

      start: () => {
        if (stops.length > 0) return
        stops = [
          deps.preferences.watch((p) => {
            choice = p.car3d
            show()
          }),
          deps.phone.watch((p) => {
            phone = p
            show()
          }),
        ]
      },

      setOn: async (on) => {
        set({ error: undefined })
        try {
          await deps.preferences.update({ car3d: on })
        } catch {
          set({ error: "Couldn't save that. Try again." })
        }
      },

      dispose: () => {
        stops.forEach((stop) => stop())
        stops = []
      },
    }
  })
}
