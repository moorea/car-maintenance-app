import { createFuelModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { FuelView } from './FuelView'

/** Wires the fuel and running costs model to the view. No state or logic lives here (ADR 0003). */
export function FuelScreen({ vehicle, onBack }: { vehicle: Vehicle; onBack: () => void }) {
  const state = useStore(useScreenModel(vehicle.id, () => createFuelModel({ vehicle, ...deps })))
  return (
    <FuelView
      {...state}
      carName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      onBack={onBack}
    />
  )
}
