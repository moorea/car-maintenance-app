import type { Vehicle } from '@car/core'
import { Tabs } from '../../ui/Tabs'
import { SafetyScreen } from '../safety/SafetyScreen'
import { ServiceLogScreen } from '../service-log/ServiceLogScreen'

/** The selected car: its service log and its recalls and complaints. */
export function CarScreen({ vehicle }: { vehicle: Vehicle }) {
  return (
    <Tabs
      key={vehicle.id}
      tabs={[
        { label: 'Service', render: () => <ServiceLogScreen vehicleId={vehicle.id} /> },
        { label: 'Recalls', render: () => <SafetyScreen vehicle={vehicle} /> },
      ]}
    />
  )
}
