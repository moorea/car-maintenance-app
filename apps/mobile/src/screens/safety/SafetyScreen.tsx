import { createSafetyModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { SafetyView } from './SafetyView'

/** Wires the safety model to the view. No state or logic lives here (ADR 0003). */
export function SafetyScreen({ vehicle }: { vehicle: Vehicle }) {
  // A new car gets its configuration once it has synced back, so that starts a fresh model.
  const model = useScreenModel(`${vehicle.id}:${vehicle.configId ?? ''}`, () =>
    createSafetyModel({ vehicle, safety: deps.safety }),
  )
  const state = useStore(model)
  return <SafetyView {...state} />
}
