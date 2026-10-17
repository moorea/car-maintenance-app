import { createWarrantyModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { WarrantyView } from './WarrantyView'

/** Wires the warranty model to the view. No state or logic lives here (ADR 0003). */
export function WarrantyScreen({ vehicle, onBack }: { vehicle: Vehicle; onBack: () => void }) {
  // The report reads the schedule of the car's configuration, which may arrive after the car.
  const key = `${vehicle.id}:${vehicle.configId ?? ''}:${vehicle.severeDuty}`
  const state = useStore(useScreenModel(key, () => createWarrantyModel({ vehicle, ...deps })))
  return (
    <WarrantyView
      {...state}
      carName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      onBack={onBack}
    />
  )
}
