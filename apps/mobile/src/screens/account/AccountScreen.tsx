import { createAccountModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { AccountView } from './AccountView'

/** Wires the account model to the view. No state or logic lives here (ADR 0003). */
export function AccountScreen(props: { onReminders: () => void }) {
  const model = useScreenModel('account', () =>
    createAccountModel({
      auth: deps.auth,
      account: deps.account,
      notifier: deps.notifier,
      reminderSettings: deps.reminderSettings,
    }),
  )
  const state = useStore(model)
  return <AccountView {...state} onReminders={props.onReminders} />
}
