import { createAskModel, type AskModel, type Vehicle } from '@car/core'
import { deps } from '../bootstrap/deps'

// One conversation per car, kept while the app runs, so leaving Ask and coming back (or
// switching cars and back) finds the conversation where it was. An answer still streaming
// carries on in the background.
const models = new Map<string, AskModel>()

/**
 * The Ask model for a car. A car that gains its configuration once it syncs gets a fresh model,
 * since the old one could not answer.
 */
export function askModelFor(vehicle: Vehicle): AskModel {
  const key = `${vehicle.id}:${vehicle.configId ?? ''}`
  let model = models.get(key)
  if (!model) {
    model = createAskModel({ vehicle, assistant: deps.assistant, ids: deps.ids })
    models.set(key, model)
  }
  return model
}
