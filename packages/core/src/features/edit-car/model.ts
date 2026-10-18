import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Vehicle } from '../../domain/types'
import type { VehicleRepo } from '../../ports'
import { nicknameSchema } from '../../schemas/vehicle'

export interface EditCarForm {
  nickname: string
  /** Why the name can't be saved, shown under the field. */
  nicknameError?: string | undefined
  saving: boolean
  /** True after the owner tapped remove once, until they confirm or change their mind. */
  confirmingRemove: boolean
  removing: boolean
  error?: string | undefined
}

export interface EditCarState {
  /** "2021 Toyota RAV4", the car the sheet is about. */
  title: string
  /** Present while the edit sheet is open. */
  form?: EditCarForm | undefined
}

export interface EditCarActions {
  start: () => void
  open: () => void
  setNickname: (value: string) => void
  /** Closes the sheet, unless a save or removal is running. */
  close: () => void
  /** Saves the name. Resolves true when saved. */
  save: () => Promise<boolean>
  /** Asks to confirm on the first tap; removes the car on the second. Resolves true when removed. */
  remove: () => Promise<boolean>
  dispose: () => void
}

export type EditCarModel = StoreApi<EditCarState & EditCarActions>

export interface EditCarDeps {
  vehicle: Vehicle
  vehicles: Pick<VehicleRepo, 'rename' | 'remove'>
}

/** Screen model for renaming a car, or removing one the owner sold or no longer has. */
export const createEditCarModel = (deps: EditCarDeps): EditCarModel => {
  const { vehicle } = deps
  return createStore<EditCarState & EditCarActions>()((set, get) => {
    const update = (patch: Partial<EditCarForm>) => {
      const form = get().form
      if (form) set({ form: { ...form, ...patch } })
    }
    const busy = (form: EditCarForm) => form.saving || form.removing

    return {
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,

      // Nothing to follow: the sheet edits the car as it was when the page opened.
      start: () => {},
      dispose: () => {},

      open: () =>
        set({
          form: {
            nickname: vehicle.nickname,
            saving: false,
            confirmingRemove: false,
            removing: false,
          },
        }),

      setNickname: (nickname) => {
        const form = get().form
        if (!form || busy(form)) return
        update({ nickname, nicknameError: undefined, confirmingRemove: false, error: undefined })
      },

      close: () => {
        const form = get().form
        if (form && !busy(form)) set({ form: undefined })
      },

      save: async () => {
        const form = get().form
        if (!form || busy(form)) return false
        const parsed = nicknameSchema.safeParse(form.nickname)
        if (!parsed.success) {
          update({ nicknameError: parsed.error.issues[0]?.message, confirmingRemove: false })
          return false
        }
        if (parsed.data === vehicle.nickname) {
          set({ form: undefined })
          return true
        }
        update({ saving: true, confirmingRemove: false, error: undefined })
        try {
          await deps.vehicles.rename(vehicle.id, parsed.data)
        } catch {
          update({ saving: false, error: "Couldn't save the name. Try again." })
          return false
        }
        set({ form: undefined })
        return true
      },

      remove: async () => {
        const form = get().form
        if (!form || busy(form)) return false
        if (!form.confirmingRemove) {
          update({ confirmingRemove: true, error: undefined })
          return false
        }
        update({ removing: true, error: undefined })
        try {
          await deps.vehicles.remove(vehicle.id)
        } catch {
          update({
            removing: false,
            confirmingRemove: false,
            error: "Couldn't remove the car. Try again.",
          })
          return false
        }
        set({ form: undefined })
        return true
      },
    }
  })
}
