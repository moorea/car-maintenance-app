import { createTroubleCodesModel, type TroubleCodesModel, type Vehicle } from '@car/core'
import { deps } from '../bootstrap/deps'

// One code lookup per car, kept while the app runs, so asking about a code and coming back finds
// the result where it was. Keyed by car, with the configuration the model watches recalls for.
const models = new Map<string, { key: string; model: TroubleCodesModel }>()

/** The code lookup model for a car. A car that gains its configuration gets a fresh one. */
export function codesModelFor(vehicle: Vehicle): TroubleCodesModel {
  const key = vehicle.configId ?? ''
  const kept = models.get(vehicle.id)
  if (kept?.key === key) return kept.model
  kept?.model.getState().dispose()
  const model = createTroubleCodesModel({
    vehicle,
    safety: deps.safety,
    odometer: deps.odometer,
    clock: deps.clock,
  })
  model.getState().start()
  models.set(vehicle.id, { key, model })
  return model
}
