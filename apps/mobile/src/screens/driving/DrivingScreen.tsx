import { createDrivingModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { DrivingView } from './DrivingView'

/** Wires the driving model to the view. No state or logic lives here (ADR 0003). */
export function DrivingScreen({ vehicle, onBack }: { vehicle: Vehicle; onBack: () => void }) {
  // Keyed by car and configuration only: saving changes the car's schedule, and the answers
  // should stay while that change arrives.
  const key = `${vehicle.id}:${vehicle.configId ?? ''}`
  const state = useStore(useScreenModel(key, () => createDrivingModel({ vehicle, ...deps })))
  return (
    <DrivingView
      {...state}
      onBack={onBack}
      onChoose={(severe) => {
        void state.choose(severe).then((saved) => {
          if (saved) onBack()
        })
      }}
    />
  )
}
