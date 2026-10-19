import { createStatusModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { StatusView } from './StatusView'

/** Wires the status model to the view. No state or logic lives here (ADR 0003). */
export function StatusScreen({ vehicle }: { vehicle: Vehicle }) {
  // As on the car's page: the car's configuration arriving, or severe driving changing the
  // intervals, starts a fresh model.
  const key = `${vehicle.id}:${vehicle.configId ?? ''}:${vehicle.severeDuty}`
  const state = useStore(useScreenModel(key, () => createStatusModel({ vehicle, ...deps })))
  return <StatusView {...state} carName={vehicle.nickname || state.title} />
}
