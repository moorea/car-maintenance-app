import { createQuoteCheckModel, type QuoteCheckModel, type Vehicle } from '@car/core'
import { deps } from '../bootstrap/deps'

// One quote per car, kept while the app runs, so asking about a line and coming back finds the
// checked quote where it was.
const models = new Map<string, QuoteCheckModel>()

/**
 * The quote check model for a car. A car that gains its configuration, or changes between normal
 * and severe driving, gets a fresh model, since the old one checked against another schedule.
 */
export function quoteModelFor(vehicle: Vehicle): QuoteCheckModel {
  const key = `${vehicle.id}:${vehicle.configId ?? ''}:${vehicle.severeDuty}`
  let model = models.get(key)
  if (!model) {
    model = createQuoteCheckModel({
      vehicle,
      schedule: deps.schedule,
      records: deps.records,
      odometer: deps.odometer,
      safety: deps.safety,
      clock: deps.clock,
      photos: deps.photos,
      reader: deps.quoteReader,
    })
    model.getState().start()
    models.set(key, model)
  }
  return model
}
