import { createStore, type StoreApi } from 'zustand/vanilla'
import type { BodyStyle, Paint, Vehicle } from '../../domain/types'
import type { VehicleRepo } from '../../ports'
import { nicknameSchema } from '../../schemas/vehicle'

export interface EditCarForm {
  nickname: string
  /** Why the name can't be saved, shown under the field. */
  nicknameError?: string | undefined
  /** The shape the app draws the car as. Unset until the VIN or the owner says. */
  bodyStyle?: BodyStyle | undefined
  paint?: Paint | undefined
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
  setBodyStyle: (value: BodyStyle) => void
  setPaint: (value: Paint) => void
  /** Closes the sheet. A save or removal already running still finishes. */
  close: () => void
  /** Saves the name and how the car looks. Resolves true when saved. */
  save: () => Promise<boolean>
  /** Asks to confirm on the first tap; removes the car on the second. Resolves true when removed. */
  remove: () => Promise<boolean>
  dispose: () => void
}

export type EditCarModel = StoreApi<EditCarState & EditCarActions>

export interface EditCarDeps {
  vehicle: Vehicle
  vehicles: Pick<VehicleRepo, 'rename' | 'setAppearance' | 'remove'>
}

/** Screen model for renaming a car, choosing how the app draws it, or removing one the owner sold or no longer has. */
export const createEditCarModel = (deps: EditCarDeps): EditCarModel => {
  // What was last saved, so the sheet reopens with it and the next save compares against it.
  let vehicle = deps.vehicle
  return createStore<EditCarState & EditCarActions>()((set, get) => {
    const update = (patch: Partial<EditCarForm>) => {
      const form = get().form
      if (form) set({ form: { ...form, ...patch } })
    }
    const busy = (form: EditCarForm) => form.saving || form.removing
    let writing = false

    return {
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,

      // Nothing to follow: the sheet edits the car as it was when the page opened.
      start: () => {},
      dispose: () => {},

      open: () => {
        // Reopened while a write is still running: it would close the new sheet when it ends.
        if (writing) return
        set({
          form: {
            nickname: vehicle.nickname,
            bodyStyle: vehicle.bodyStyle,
            paint: vehicle.paint,
            saving: false,
            confirmingRemove: false,
            removing: false,
          },
        })
      },

      setNickname: (nickname) => {
        const form = get().form
        if (!form || busy(form)) return
        update({ nickname, nicknameError: undefined, confirmingRemove: false, error: undefined })
      },

      setBodyStyle: (bodyStyle) => {
        const form = get().form
        if (!form || busy(form)) return
        update({ bodyStyle, confirmingRemove: false, error: undefined })
      },

      setPaint: (paint) => {
        const form = get().form
        if (!form || busy(form)) return
        update({ paint, confirmingRemove: false, error: undefined })
      },

      // A swipe closes the sheet whatever the model says, so the form always goes with it; a save
      // or removal still running finishes on its own.
      close: () => set({ form: undefined }),

      save: async () => {
        const form = get().form
        if (!form || busy(form)) return false
        const parsed = nicknameSchema.safeParse(form.nickname)
        if (!parsed.success) {
          update({ nicknameError: parsed.error.issues[0]?.message, confirmingRemove: false })
          return false
        }
        const renamed = parsed.data !== vehicle.nickname
        const restyled = form.bodyStyle !== vehicle.bodyStyle || form.paint !== vehicle.paint
        if (!renamed && !restyled) {
          set({ form: undefined })
          return true
        }
        update({ saving: true, confirmingRemove: false, error: undefined })
        writing = true
        try {
          if (renamed) await deps.vehicles.rename(vehicle.id, parsed.data)
          if (restyled)
            await deps.vehicles.setAppearance(vehicle.id, {
              ...(form.bodyStyle && { bodyStyle: form.bodyStyle }),
              ...(form.paint && { paint: form.paint }),
            })
        } catch {
          update({ saving: false, error: "Couldn't save your changes. Try again." })
          return false
        } finally {
          writing = false
        }
        vehicle = {
          ...vehicle,
          nickname: parsed.data,
          ...(form.bodyStyle && { bodyStyle: form.bodyStyle }),
          ...(form.paint && { paint: form.paint }),
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
        writing = true
        try {
          await deps.vehicles.remove(vehicle.id)
        } catch {
          update({
            removing: false,
            confirmingRemove: false,
            error: "Couldn't remove the car. Try again.",
          })
          return false
        } finally {
          writing = false
        }
        set({ form: undefined })
        return true
      },
    }
  })
}
