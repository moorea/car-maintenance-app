import { createYourDataModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { YourDataView } from './YourDataView'

/** Wires the your-data model to the view. No state or logic lives here (ADR 0003). */
export function YourDataScreen(props: { onBack: () => void }) {
  const model = useScreenModel('your-data', () =>
    createYourDataModel({
      auth: deps.auth,
      vehicles: deps.vehicles,
      odometer: deps.odometer,
      services: deps.records,
      attachments: deps.attachments,
      warranties: deps.warranties,
      fillUps: deps.fillUps,
      renewals: deps.renewals,
      customItems: deps.customItems,
      schedule: deps.schedule,
      files: deps.dataFiles,
      clock: deps.clock,
      ids: deps.ids,
    }),
  )
  const state = useStore(model)
  return <YourDataView {...state} onBack={props.onBack} />
}
