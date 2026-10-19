import { createAccountModel, createAiSharingModel, createCar3dModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { openPrivacyPolicy } from '../../bootstrap/links'
import { useScreenModel } from '../../models/useScreenModel'
import { AccountView } from './AccountView'

/** Wires the account model to the view. No state or logic lives here (ADR 0003). */
export function AccountScreen(props: {
  /** Absent when the owner has no car, so there are no reminders to set. */
  onReminders?: () => void
  /** Shown as a back button where there is no tab bar to leave by. */
  onBack?: () => void
  /** Absent until the owner's cars have synced. */
  onYourData?: (() => void) | undefined
}) {
  const model = useScreenModel('account', () =>
    createAccountModel({
      auth: deps.auth,
      account: deps.account,
      notifier: deps.notifier,
      reminderSettings: deps.reminderSettings,
    }),
  )
  const state = useStore(model)
  const sharing = useStore(
    useScreenModel('ai-sharing', () =>
      createAiSharingModel({ preferences: deps.preferences, auth: deps.auth }),
    ),
  )
  const car3d = useStore(useScreenModel('car-3d', () => createCar3dModel(deps)))
  return (
    <AccountView
      {...state}
      aiSharing={sharing}
      car3d={car3d}
      onPrivacyPolicy={openPrivacyPolicy}
      onReminders={props.onReminders}
      onYourData={props.onYourData}
      onBack={props.onBack}
    />
  )
}
