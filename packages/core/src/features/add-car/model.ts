import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import { VinDecodeError, type DecodedVin, type Vehicle } from '../../domain/types'
import type { Clock, IdGenerator, Unsubscribe, VehicleRepo, VinDecoder } from '../../ports'
import { vehicleDetailsSchema, vinSchema, type VehicleDetailsDraft } from '../../schemas/vehicle'

/** First the VIN (or a choice to skip it), then the car's details to check and save. */
export type AddCarStep = 'vin' | 'details'
export type DetailsField = keyof VehicleDetailsDraft
export type AddCarFieldErrors = Partial<Record<DetailsField | 'vin', string>>

export interface AddCarState {
  step: AddCarStep
  vin: string
  /** What the VIN decoded to, when the details came from it. */
  decoded?: DecodedVin | undefined
  draft: Required<VehicleDetailsDraft>
  severeDuty: boolean
  /** True while looking up the VIN or saving; the form ignores submits meanwhile. */
  busy: boolean
  fieldErrors: AddCarFieldErrors
  /** A problem with the lookup or the save, shown above the button. */
  error?: string | undefined
}

export interface AddCarActions {
  /** Starts watching the owner's cars, to catch a car added twice. */
  start: () => void
  dispose: () => void
  setVin: (vin: string) => void
  /** Decodes the VIN and moves on to the details, filled in. Resolves true on success. */
  lookUpVin: () => Promise<boolean>
  /** Skips the VIN and moves on to empty details for the owner to fill in. */
  enterManually: () => void
  /** Goes back to the VIN step. */
  back: () => void
  setField: (field: DetailsField, value: string) => void
  setSevereDuty: (severeDuty: boolean) => void
  /** Validates and saves the car. Resolves with its id on success. */
  save: () => Promise<string | undefined>
}

export type AddCarModel = StoreApi<AddCarState & AddCarActions>

export interface AddCarDeps {
  ownerId: string
  vehicles: VehicleRepo
  vinDecoder: VinDecoder
  clock: Clock
  ids: IdGenerator
  /** Told the new car's id once it is saved, e.g. to close the screen and show the car. */
  onAdded?: (id: string) => void
}

const emptyDraft: Required<VehicleDetailsDraft> = {
  year: '',
  make: '',
  model: '',
  trim: '',
  nickname: '',
  odometerMiles: '',
}

const LOOKUP_MESSAGES: Record<VinDecodeError['kind'], string> = {
  'not-found': "We couldn't find that VIN. Check it, or enter your car's details yourself.",
  network:
    "Couldn't reach the VIN lookup. Check your connection, or enter your car's details yourself.",
  unknown: 'Something went wrong looking up that VIN. Try again, or enter the details yourself.',
}
const DUPLICATE = "You've already added this car."

const toFieldErrors = (error: z.ZodError): AddCarFieldErrors =>
  Object.fromEntries(
    error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, issue.message]] : []
    }),
  )

/** Screen model for adding a car: by VIN through a lookup, or by year, make and model. */
export const createAddCarModel = (deps: AddCarDeps): AddCarModel => {
  let unsubscribe: Unsubscribe | undefined
  let owned: Vehicle[] = []
  const alreadyAdded = (vin: string) => owned.some((v) => v.vin === vin)

  return createStore<AddCarState & AddCarActions>()((set, get) => ({
    step: 'vin',
    vin: '',
    draft: emptyDraft,
    severeDuty: false,
    busy: false,
    fieldErrors: {},

    start: () => {
      if (unsubscribe) return
      unsubscribe = deps.vehicles.watchOwned(deps.ownerId, (vehicles) => {
        owned = vehicles
      })
    },

    dispose: () => {
      unsubscribe?.()
      unsubscribe = undefined
    },

    setVin: (vin) => set({ vin, fieldErrors: {}, error: undefined }),

    lookUpVin: async () => {
      if (get().busy) return false
      const parsed = vinSchema.safeParse(get().vin)
      if (!parsed.success) {
        set({
          fieldErrors: { vin: parsed.error.issues[0]?.message ?? 'Check the VIN' },
          error: undefined,
        })
        return false
      }
      const vin = parsed.data
      if (alreadyAdded(vin)) {
        set({ error: DUPLICATE })
        return false
      }
      set({ busy: true, error: undefined, vin })
      try {
        const decoded = await deps.vinDecoder.decode(vin)
        set({
          busy: false,
          step: 'details',
          decoded,
          fieldErrors: {},
          draft: {
            ...get().draft,
            year: String(decoded.year),
            make: decoded.make,
            model: decoded.model,
            trim: decoded.trim ?? '',
          },
        })
        return true
      } catch (e) {
        const kind = e instanceof VinDecodeError ? e.kind : 'unknown'
        set({ busy: false, error: LOOKUP_MESSAGES[kind] })
        return false
      }
    },

    enterManually: () =>
      set({
        step: 'details',
        vin: '',
        decoded: undefined,
        draft: { ...emptyDraft, nickname: get().draft.nickname },
        fieldErrors: {},
        error: undefined,
      }),

    back: () => set({ step: 'vin', fieldErrors: {}, error: undefined }),

    setField: (field, value) =>
      set((s) => {
        const { [field]: _cleared, ...fieldErrors } = s.fieldErrors
        return { draft: { ...s.draft, [field]: value }, fieldErrors, error: undefined }
      }),

    setSevereDuty: (severeDuty) => set({ severeDuty }),

    save: async () => {
      if (get().busy) return undefined
      const maxYear = Number(deps.clock.today().slice(0, 4)) + 1
      const parsed = vehicleDetailsSchema(maxYear).safeParse(get().draft)
      if (!parsed.success) {
        set({ fieldErrors: toFieldErrors(parsed.error), error: undefined })
        return undefined
      }
      const d = parsed.data
      const { decoded, severeDuty } = get()
      if (decoded && alreadyAdded(decoded.vin)) {
        set({ error: DUPLICATE })
        return undefined
      }
      const vehicle: Vehicle = {
        id: deps.ids.next(),
        year: d.year,
        make: d.make,
        model: d.model,
        nickname: d.nickname ?? `${d.year} ${d.make} ${d.model}`,
        severeDuty,
        ...(d.trim !== undefined && { trim: d.trim }),
        ...(decoded && { vin: decoded.vin }),
        ...(decoded?.engine !== undefined && { engine: decoded.engine }),
        ...(decoded?.drivetrain !== undefined && { drivetrain: decoded.drivetrain }),
      }
      const firstReading =
        d.odometerMiles === undefined
          ? undefined
          : { vehicleId: vehicle.id, date: deps.clock.today(), miles: d.odometerMiles }
      set({ busy: true, error: undefined })
      try {
        await deps.vehicles.add(deps.ownerId, vehicle, firstReading)
        set({ busy: false })
        deps.onAdded?.(vehicle.id)
        return vehicle.id
      } catch {
        set({ busy: false, error: 'Could not save your car. Try again.' })
        return undefined
      }
    },
  }))
}
