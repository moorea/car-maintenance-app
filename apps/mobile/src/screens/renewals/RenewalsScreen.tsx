import { createAttachmentsModel, createRenewalsModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { RenewalsView } from './RenewalsView'

/** Wires the renewals and documents models to the view. No state or logic lives here (ADR 0003). */
export function RenewalsScreen({ vehicle, onBack }: { vehicle: Vehicle; onBack: () => void }) {
  const state = useStore(
    useScreenModel(vehicle.id, () => createRenewalsModel({ vehicleId: vehicle.id, ...deps })),
  )
  const documents = useStore(
    useScreenModel(vehicle.id, () => createAttachmentsModel({ vehicleId: vehicle.id, ...deps })),
  )
  return (
    <RenewalsView
      {...state}
      documents={documents}
      carName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      onBack={onBack}
    />
  )
}
