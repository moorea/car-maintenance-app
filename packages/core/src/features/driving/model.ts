import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Vehicle } from '../../domain/types'
import { isGeneralGuidance } from '../../lib/schedule'
import type { ScheduleRepo, VehicleRepo } from '../../ports'
import {
  assessDriving,
  severeDifferences,
  type DrivingAnswers,
  type DrivingAssessment,
  type DrivingConditionId,
  type ScheduleDifference,
} from './conditions'

export interface DrivingState {
  /** `loading` while the schedule is read; `saving` while the choice is written. */
  status: 'loading' | 'ready' | 'saving'
  /** "2021 Toyota RAV4", under the screen's title. */
  carTitle: string
  /** True when the car is on the severe schedule now. */
  severeNow: boolean
  answers: DrivingAnswers
  /**
   * False until the owner answers a question. The answers aren't kept, so until then there is
   * nothing to recommend and the screen only says which schedule the car is on.
   */
  answered: boolean
  /** Which schedule the answers point to, and why. */
  assessment: DrivingAssessment
  /** What changes on the severe schedule. Empty before the car has synced its schedule. */
  differences: ScheduleDifference[]
  /** True when the schedule is general guidance rather than the manufacturer's. */
  generalSchedule: boolean
  error?: string | undefined
}

export interface DrivingActions {
  start: () => void
  answer: (id: DrivingConditionId, yes: boolean) => void
  /** Puts the car on the severe schedule or the normal one. Resolves true once saved. */
  choose: (severe: boolean) => Promise<boolean>
  dispose: () => void
}

export type DrivingModel = StoreApi<DrivingState & DrivingActions>

export interface DrivingDeps {
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'configId' | 'severeDuty'>
  vehicles: Pick<VehicleRepo, 'setSevereDuty'>
  schedule: ScheduleRepo
}

/**
 * Screen model for choosing between the normal and severe maintenance schedules: a few questions
 * about how the car is driven decide, and the owner sees what changes before saving.
 */
export const createDrivingModel = (deps: DrivingDeps): DrivingModel => {
  const { vehicle } = deps
  let disposed = false

  return createStore<DrivingState & DrivingActions>()((set, get) => ({
    status: 'loading',
    carTitle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    severeNow: vehicle.severeDuty,
    answers: {},
    answered: false,
    assessment: assessDriving({}),
    differences: [],
    generalSchedule: false,

    start: () => {
      disposed = false
      if (vehicle.configId === undefined) {
        set({ status: 'ready' })
        return
      }
      deps.schedule.itemsForVehicle(vehicle).then(
        (items) => {
          if (disposed) return
          set({
            status: 'ready',
            differences: severeDifferences(items),
            generalSchedule: isGeneralGuidance(items),
          })
        },
        () => {
          // The questions still work without the list of what changes.
          if (!disposed) set({ status: 'ready' })
        },
      )
    },

    answer: (id, yes) => {
      const answers = { ...get().answers, [id]: yes }
      set({ answers, answered: true, assessment: assessDriving(answers) })
    },

    choose: async (severe) => {
      if (get().status === 'saving') return false
      set({ status: 'saving', error: undefined })
      try {
        await deps.vehicles.setSevereDuty(vehicle.id, severe)
        if (!disposed) set({ status: 'ready', severeNow: severe })
        return true
      } catch {
        if (!disposed) set({ status: 'ready', error: 'Couldn’t save the schedule. Try again.' })
        return false
      }
    },

    dispose: () => {
      disposed = true
    },
  }))
}
