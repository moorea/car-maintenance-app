import { describe, expect, it } from 'vitest'
import type { NotificationPermission } from '../../ports'
import { memoryAccount, memoryAuth, memoryNotifier, memoryReminderSettings } from '../../testing'
import { createAccountModel } from './model'

const OWNER = { id: 'owner-1', email: 'sam@example.com' }

const setup = (options: { enabled?: boolean; permission?: NotificationPermission } = {}) => {
  const auth = memoryAuth({ user: OWNER })
  const account = memoryAccount(auth)
  const notifier = memoryNotifier({ permission: options.permission ?? 'granted' })
  const reminderSettings = memoryReminderSettings({ enabled: options.enabled ?? true })
  const model = createAccountModel({ auth, account, notifier, reminderSettings })
  model.getState().start()
  return { auth, account, notifier, reminderSettings, model }
}

/** Lets the model's permission checks finish. */
const settled = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve()
}

const signedIn = (auth: ReturnType<typeof memoryAuth>) => {
  let user: unknown
  auth.watchUser((u) => (user = u))()
  return user !== null
}

describe('account model', () => {
  it('shows the email the owner signs in with', () => {
    const { model } = setup()
    expect(model.getState().email).toBe('sam@example.com')
  })

  describe('reminders summary', () => {
    it('is on when reminders are turned on and the phone allows them', async () => {
      const { model } = setup({ enabled: true, permission: 'granted' })
      await settled()
      expect(model.getState().reminders).toBe('on')
    })

    it('is off when the owner has not turned them on', async () => {
      const { model } = setup({ enabled: false, permission: 'granted' })
      await settled()
      expect(model.getState().reminders).toBe('off')
    })

    it('is off when turned on but never allowed', async () => {
      const { model } = setup({ enabled: true, permission: 'undetermined' })
      await settled()
      expect(model.getState().reminders).toBe('off')
    })

    it('says blocked when the phone does not allow notifications', async () => {
      const { model } = setup({ enabled: true, permission: 'denied' })
      await settled()
      expect(model.getState().reminders).toBe('blocked')
    })

    it('follows the reminder setting as it changes', async () => {
      const { model, reminderSettings } = setup({ enabled: false })
      await settled()
      await reminderSettings.set({ enabled: true })
      await settled()
      expect(model.getState().reminders).toBe('on')
    })
  })

  describe('signing out', () => {
    it('signs the owner out', async () => {
      const { model, auth } = setup()
      await model.getState().signOut()
      expect(signedIn(auth)).toBe(false)
      expect(model.getState().status).toBe('ready')
    })

    it('does not report a server failure, since the phone is signed out regardless', async () => {
      const { model, auth } = setup()
      auth.failNext('network')
      await model.getState().signOut()
      expect(signedIn(auth)).toBe(false)
      expect(model.getState().error).toBeUndefined()
    })
  })

  describe('deleting the account', () => {
    it('asks for confirmation before deleting anything', () => {
      const { model, account } = setup()
      model.getState().askToDelete()
      expect(model.getState().status).toBe('confirming-delete')
      expect(account.deletions).toBe(0)
    })

    it('deletes nothing when the owner cancels', async () => {
      const { model, account, auth } = setup()
      model.getState().askToDelete()
      model.getState().cancelDelete()
      await model.getState().confirmDelete()
      expect(model.getState().status).toBe('ready')
      expect(account.deletions).toBe(0)
      expect(signedIn(auth)).toBe(true)
    })

    it('deletes the account once confirmed, which signs the owner out', async () => {
      const { model, account, auth } = setup()
      model.getState().askToDelete()
      const deleting = model.getState().confirmDelete()
      expect(model.getState().status).toBe('deleting')
      await deleting
      expect(account.deletions).toBe(1)
      expect(signedIn(auth)).toBe(false)
    })

    it('deletes only once however many times confirm is tapped', async () => {
      const { model, account } = setup()
      model.getState().askToDelete()
      await Promise.all([model.getState().confirmDelete(), model.getState().confirmDelete()])
      expect(account.deletions).toBe(1)
    })

    it('asks the owner to try again when the connection drops', async () => {
      const { model, account, auth } = setup()
      account.failNext('network')
      model.getState().askToDelete()
      await model.getState().confirmDelete()
      expect(model.getState()).toMatchObject({
        status: 'confirming-delete',
        error: expect.stringContaining('Check your connection') as unknown,
      })
      expect(signedIn(auth)).toBe(true)

      await model.getState().confirmDelete()
      expect(account.deletions).toBe(1)
      expect(model.getState().error).toBeUndefined()
    })

    it('explains any other failure without blaming the connection', async () => {
      const { model, account } = setup()
      account.failNext('unknown')
      model.getState().askToDelete()
      await model.getState().confirmDelete()
      expect(model.getState().error).toMatch(/not deleted/)
      expect(model.getState().error).not.toMatch(/connection/)
    })

    it('clears the error when the owner cancels', async () => {
      const { model, account } = setup()
      account.failNext('network')
      model.getState().askToDelete()
      await model.getState().confirmDelete()
      model.getState().cancelDelete()
      expect(model.getState()).toMatchObject({ status: 'ready', error: undefined })
    })

    it('cannot start while signing out', async () => {
      const { model } = setup()
      const signingOut = model.getState().signOut()
      model.getState().askToDelete()
      expect(model.getState().status).toBe('signing-out')
      await signingOut
    })
  })

  it('stops following the owner and settings once disposed', async () => {
    const { model, reminderSettings } = setup({ enabled: false })
    await settled()
    model.getState().dispose()
    await reminderSettings.set({ enabled: true })
    await settled()
    expect(model.getState().reminders).toBe('off')
  })
})
