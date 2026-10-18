import { createTiresModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { TiresView } from './TiresView'

/** Wires the tires model to the view. No state or logic lives here (ADR 0003). */
export function TiresScreen({ vehicle, onBack }: { vehicle: Vehicle; onBack: () => void }) {
  const state = useStore(useScreenModel(vehicle.id, () => createTiresModel({ vehicle, ...deps })))
  return (
    <TiresView
      {...state}
      carName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      onBack={onBack}
    />
  )
}
