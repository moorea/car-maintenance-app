import type { Vehicle } from '@car/core'
import { SafetyScreen } from '../safety/SafetyScreen'

/** The selected car. For now its recalls and complaints; the schedule view replaces this next. */
export function CarScreen({ vehicle }: { vehicle: Vehicle }) {
  return <SafetyScreen key={vehicle.id} vehicle={vehicle} />
}
