import { createServiceLogModel, type SessionState, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { ServiceLogView } from './ServiceLogView'

interface Props {
  vehicle: Vehicle
  /** Set when the owner asked elsewhere to log a service, so the form opens. */
  request?: SessionState['logRequest']
}

/** Wires the core model to the view. No state or logic lives here (ADR 0003). */
export function ServiceLogScreen({ vehicle, request }: Props) {
  // Each request starts a fresh model with the form open; so does the car's config arriving.
  const key = `${vehicle.id}:${vehicle.configId ?? ''}:${request?.seq ?? 0}`
  const model = useScreenModel(key, () =>
    createServiceLogModel({
      vehicleId: vehicle.id,
      configId: vehicle.configId,
      startWith: request && { itemId: request.itemId },
      ...deps,
    }),
  )
  const state = useStore(model)
  return <ServiceLogView {...state} carName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
}
