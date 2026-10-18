import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Vehicle, VehicleId } from '../../domain/types'
import type { VehicleRepo } from '../../ports'

/** A car in the list being arranged. */
export interface ArrangeRow {
  id: VehicleId
  /** The name the garage shows: "Daily". */
  title: string
  /** What the car is, under its name: "2021 Toyota RAV4 XLE". */
  detail: string
}

export interface ArrangeForm {
  /** The cars in the order the owner is putting them. */
  cars: ArrangeRow[]
  saving: boolean
  error?: string | undefined
}

export interface ArrangeCarsState {
  /** Present while the sheet is open. */
  form?: ArrangeForm | undefined
}

export interface ArrangeCarsActions {
  start: () => void
  open: () => void
  moveUp: (id: VehicleId) => void
  moveDown: (id: VehicleId) => void
  /** Closes the sheet without saving. A save already running still finishes. */
  close: () => void
  /** Saves the order. Resolves true when saved, or when nothing moved. */
  save: () => Promise<boolean>
  dispose: () => void
}

export type ArrangeCarsModel = StoreApi<ArrangeCarsState & ArrangeCarsActions>

export interface ArrangeCarsDeps {
  /** The owner's cars, in the order the garage shows them now. */
  cars: Vehicle[]
  vehicles: Pick<VehicleRepo, 'reorder'>
}

const describe = (v: Vehicle) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')

/** Screen model for putting the owner's cars in the order they want in the garage. */
export const createArrangeCarsModel = (deps: ArrangeCarsDeps): ArrangeCarsModel =>
  createStore<ArrangeCarsState & ArrangeCarsActions>()((set, get) => {
    const original = deps.cars.map((v) => v.id)

    const reorder = (next: (cars: ArrangeRow[]) => ArrangeRow[]) => {
      const form = get().form
      if (!form || form.saving) return
      set({ form: { ...form, cars: next(form.cars), error: undefined } })
    }

    const swap = (id: VehicleId, by: -1 | 1) =>
      reorder((cars) => {
        const at = cars.findIndex((c) => c.id === id)
        const to = at + by
        if (at < 0 || to < 0 || to >= cars.length) return cars
        const next = [...cars]
        next.splice(to, 0, ...next.splice(at, 1))
        return next
      })

    return {
      // Nothing to follow: the sheet arranges the cars as they were when the garage opened.
      start: () => {},
      dispose: () => {},

      open: () => {
        if (get().form?.saving) return
        set({
          form: {
            cars: deps.cars.map((v) => {
              const description = describe(v)
              const title = v.nickname.trim() || description
              return { id: v.id, title, detail: title === description ? '' : description }
            }),
            saving: false,
          },
        })
      },

      moveUp: (id) => swap(id, -1),
      moveDown: (id) => swap(id, 1),

      close: () => {
        if (!get().form?.saving) set({ form: undefined })
      },

      save: async () => {
        const form = get().form
        if (!form || form.saving) return false
        const ids = form.cars.map((c) => c.id)
        // Saving an unchanged order would still pin every car, so a car added later would no
        // longer fall into place by name.
        if (ids.every((id, i) => id === original[i])) {
          set({ form: undefined })
          return true
        }
        set({ form: { ...form, saving: true, error: undefined } })
        try {
          await deps.vehicles.reorder(ids)
          set({ form: undefined })
          return true
        } catch {
          const current = get().form
          if (current)
            set({
              form: { ...current, saving: false, error: "Couldn't save the order. Try again." },
            })
          return false
        }
      },
    }
  })
