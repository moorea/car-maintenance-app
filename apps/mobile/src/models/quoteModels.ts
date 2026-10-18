import { createQuoteCheckModel, type QuoteCheckModel, type Vehicle } from '@car/core'
import { deps } from '../bootstrap/deps'

// One quote per car, kept while the app runs, so asking about a line and coming back finds the
// checked quote where it was. Keyed by car, with the schedule settings the model was made for.
const models = new Map<string, { key: string; model: QuoteCheckModel }>()

/**
 * The quote check model for a car. A car that gains its configuration, or changes between normal
 * and severe driving, gets a fresh model, since the old one checked against another schedule.
 */
export function quoteModelFor(vehicle: Vehicle): QuoteCheckModel {
  const key = `${vehicle.configId ?? ''}:${vehicle.severeDuty}`
  const kept = models.get(vehicle.id)
  if (kept?.key === key) return kept.model
  // The old model watches recalls for the old configuration, so it is stopped.
  kept?.model.getState().dispose()
  const model = createQuoteCheckModel({
    vehicle,
    vehicles: deps.vehicles,
    schedule: deps.schedule,
    records: deps.records,
    odometer: deps.odometer,
    safety: deps.safety,
    clock: deps.clock,
    photos: deps.photos,
    reader: deps.quoteReader,
  })
  model.getState().start()
  models.set(vehicle.id, { key, model })
  return model
}
