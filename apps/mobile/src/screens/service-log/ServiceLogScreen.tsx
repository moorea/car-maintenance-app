import { createServiceLogModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { ServiceLogView } from './ServiceLogView'

/** Wires the core model to the view. No state or logic lives here (ADR 0003). */
export function ServiceLogScreen({ vehicleId }: { vehicleId: string }) {
  const model = useScreenModel(vehicleId, () => createServiceLogModel({ vehicleId, ...deps }))
  const state = useStore(model)
  return <ServiceLogView {...state} />
}
