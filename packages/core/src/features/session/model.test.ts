import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../../domain/types'
import { memoryAuth, memoryNotifier, memorySync, memoryVehicles } from '../../testing'
import { createSessionModel } from './model'

const car = { year: 2020, make: 'Honda', severeDuty: false }
const civic: Vehicle = { ...car, id: 'v-civic', configId: 'c1', model: 'Civic', nickname: 'Civic' }
const accord: Vehicle = {
  ...car,
  id: 'v-accord',
  configId: 'c2',
  model: 'Accord',
  nickname: 'Accord',
}

const setup = (signedIn: boolean, owned: Vehicle[] = [], synced = true) => {
  const auth = memoryAuth(signedIn ? { user: { id: 'u1', email: 'a@example.com' } } : {})
  const vehicles = memoryVehicles(owned)
  const sync = memorySync({ synced })
  const notifier = memoryNotifier()
  const model = createSessionModel({ auth, vehicles, sync, notifier })
  return { auth, vehicles, sync, notifier, model }
}

describe('session model', () => {
  it('is starting until it is started', () => {
    expect(setup(true).model.getState().status).toBe('starting')
  })

  it('shows sign-in when nobody is signed in', () => {
    const { model } = setup(false)
    model.getState().start()
    expect(model.getState().status).toBe('signed-out')
  })

  it("selects the signed-in owner's first car by name", () => {
    const { model } = setup(true, [civic, accord])
    model.getState().start()
    expect(model.getState()).toMatchObject({ status: 'ready', selectedVehicleId: 'v-accord' })
    expect(model.getState().vehicles.map((v) => v.nickname)).toEqual(['Accord', 'Civic'])
  })

  it('asks for a car when the owner has none, then shows it once one syncs', () => {
    const { vehicles, model } = setup(true)
    model.getState().start()
    expect(model.getState().status).toBe('no-vehicles')
    vehicles.set([civic])
    expect(model.getState()).toMatchObject({ status: 'ready', selectedVehicleId: 'v-civic' })
  })

  it('waits for the first sync on a new device instead of asking for a car', () => {
    const { vehicles, model } = setup(true, [], false)
    model.getState().start()
    expect(model.getState().status).toBe('syncing')
    vehicles.set([civic])
    expect(model.getState().status).toBe('ready')
  })

  it('does not ask for a car on a synced device before its cars have loaded', () => {
    let deliver: (vehicles: Vehicle[]) => void = () => {}
    const auth = memoryAuth({ user: { id: 'u1' } })
    const vehicles = {
      ...memoryVehicles(),
      watchOwned: (_ownerId: string, onChange: (vehicles: Vehicle[]) => void) => {
        deliver = onChange
        return () => {}
      },
    }
    const model = createSessionModel({ auth, vehicles, sync: memorySync() })
    model.getState().start()
    expect(model.getState().status).toBe('starting')
    deliver([civic])
    expect(model.getState().status).toBe('ready')
  })

  it('asks for a car once the first sync finds none', () => {
    const { sync, model } = setup(true, [], false)
    model.getState().start()
    sync.complete()
    expect(model.getState().status).toBe('no-vehicles')
  })

  it('switches straight from one account to another', async () => {
    const { auth, vehicles, model } = setup(true, [civic])
    model.getState().start()
    await auth.sendCode('b@example.com')
    await auth.verifyCode('b@example.com', '123456')
    expect(model.getState()).toMatchObject({ status: 'no-vehicles', vehicles: [] })
    expect(model.getState().user?.email).toBe('b@example.com')
    vehicles.set([civic])
    expect(model.getState().selectedVehicleId).toBeUndefined()
  })

  it('ends signed out even when the server cannot be told', async () => {
    const { auth, model } = setup(true, [civic])
    model.getState().start()
    auth.failNext('network')
    await expect(model.getState().signOut()).resolves.toBeUndefined()
    expect(model.getState().status).toBe('signed-out')
  })

  it('keeps the chosen car selected when the list changes', () => {
    const { vehicles, model } = setup(true, [civic, accord])
    model.getState().start()
    model.getState().selectVehicle('v-civic')
    vehicles.set([civic, accord, { ...civic, id: 'v-new', nickname: 'Beetle' }])
    expect(model.getState().selectedVehicleId).toBe('v-civic')
  })

  it('moves to another car when the selected one is removed', () => {
    const { vehicles, model } = setup(true, [civic, accord])
    model.getState().start()
    vehicles.set([civic])
    expect(model.getState().selectedVehicleId).toBe('v-civic')
  })

  it('ignores selecting a car the owner does not have', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().selectVehicle('someone-elses')
    expect(model.getState().selectedVehicleId).toBe('v-civic')
  })

  it('goes back to sign-in and forgets the cars on sign-out', async () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    await model.getState().signOut()
    expect(model.getState()).toMatchObject({ status: 'signed-out', vehicles: [] })
    expect(model.getState().selectedVehicleId).toBeUndefined()
  })

  it("never shows a previous owner's cars to the next person who signs in", async () => {
    const { auth, model } = setup(true, [civic])
    model.getState().start()
    await model.getState().signOut()
    await auth.sendCode('b@example.com')
    await auth.verifyCode('b@example.com', '123456')
    expect(model.getState()).toMatchObject({ status: 'no-vehicles', vehicles: [] })
  })

  it('stops following vehicle changes after sign-out', async () => {
    const { vehicles, model } = setup(true, [civic])
    model.getState().start()
    await model.getState().signOut()
    vehicles.set([accord])
    expect(model.getState()).toMatchObject({ status: 'signed-out', vehicles: [] })
  })

  it('stops following everything once disposed', async () => {
    const { auth, model } = setup(true, [civic])
    model.getState().start()
    model.getState().dispose()
    await auth.signOut()
    expect(model.getState().status).toBe('ready')
  })
})

describe('session model, adding a car', () => {
  it('opens and closes "add your car" over the selected car', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().addCar()
    expect(model.getState()).toMatchObject({ addingCar: true, status: 'ready' })
    model.getState().cancelAddCar()
    expect(model.getState().addingCar).toBe(false)
  })

  it('selects the new car once it shows up in the list', () => {
    const { vehicles, model } = setup(true, [civic])
    model.getState().start()
    model.getState().addCar()
    model.getState().carAdded('v-accord')
    expect(model.getState()).toMatchObject({ addingCar: false, selectedVehicleId: 'v-civic' })
    vehicles.set([civic, accord])
    expect(model.getState().selectedVehicleId).toBe('v-accord')
  })

  it('selects the new car straight away when the list already has it', () => {
    const { vehicles, model } = setup(true, [civic])
    model.getState().start()
    vehicles.set([civic, { ...accord, nickname: 'Zephyr' }])
    model.getState().carAdded('v-accord')
    expect(model.getState().selectedVehicleId).toBe('v-accord')
  })

  it('goes from asking for a first car to showing it', () => {
    const { vehicles, model } = setup(true)
    model.getState().start()
    model.getState().carAdded('v-civic')
    vehicles.set([accord, civic])
    expect(model.getState()).toMatchObject({ status: 'ready', selectedVehicleId: 'v-civic' })
  })

  it('offers reminders once a car is added, until they have been offered', () => {
    const { model } = setup(true)
    model.getState().start()
    expect(model.getState().offerRemindersFor).toBeUndefined()
    model.getState().carAdded('v-civic')
    expect(model.getState().offerRemindersFor).toBe('v-civic')
    model.getState().remindersOffered()
    expect(model.getState().offerRemindersFor).toBeUndefined()
  })

  it('drops a pending reminder offer on sign-out', async () => {
    const { model } = setup(true)
    model.getState().start()
    model.getState().carAdded('v-civic')
    await model.getState().signOut()
    expect(model.getState().offerRemindersFor).toBeUndefined()
  })

  it('keeps a car the owner picks while a just-added car has not shown up yet', () => {
    const { vehicles, model } = setup(true, [civic, accord])
    model.getState().start()
    model.getState().carAdded('v-new')
    model.getState().selectVehicle('v-civic')
    vehicles.set([civic, accord, { ...civic, id: 'v-new', nickname: 'New' }])
    expect(model.getState().selectedVehicleId).toBe('v-civic')
  })

  it('does not open "add your car" for someone signed out, and closes it on sign-out', async () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().addCar()
    await model.getState().signOut()
    expect(model.getState().addingCar).toBe(false)
    model.getState().addCar()
    expect(model.getState().addingCar).toBe(false)
  })

  it('opens the car a tapped reminder is about', () => {
    const { model, notifier } = setup(true, [civic, accord])
    model.getState().start()
    model.getState().addCar()
    notifier.tap('v-civic')
    expect(model.getState()).toMatchObject({
      selectedVehicleId: 'v-civic',
      addingCar: false,
      tab: 'car',
    })
  })

  it('opens the tapped car once the cars load when a reminder launched the app', () => {
    const auth = memoryAuth({ user: { id: 'u1' } })
    const vehicles = memoryVehicles([])
    const model = createSessionModel({
      auth,
      vehicles,
      sync: memorySync({ synced: false }),
      // The launching tap is reported as soon as anyone listens, before sign-in is known.
      notifier: { watchOpened: (onOpen) => (onOpen('v-civic'), () => {}) },
    })
    model.getState().start()
    expect(model.getState().status).toBe('syncing')
    vehicles.set([civic, accord])
    expect(model.getState()).toMatchObject({ status: 'ready', selectedVehicleId: 'v-civic' })
    // The tap is used up: later changes keep the owner's own choice.
    model.getState().selectVehicle('v-accord')
    vehicles.set([civic, accord])
    expect(model.getState().selectedVehicleId).toBe('v-accord')
  })

  it("lets the owner's own choice win over a tapped car that has not loaded yet", () => {
    const vehicles = memoryVehicles([accord])
    const model = createSessionModel({
      auth: memoryAuth({ user: { id: 'u1' } }),
      vehicles,
      sync: memorySync({ synced: false }),
      notifier: { watchOpened: (onOpen) => (onOpen('v-civic'), () => {}) },
    })
    model.getState().start()
    model.getState().addCar()
    vehicles.set([civic, accord])
    expect(model.getState()).toMatchObject({ selectedVehicleId: 'v-accord', addingCar: true })
  })

  it('opens a tapped car rather than a car added before the tap that has not shown up', () => {
    const { model, notifier } = setup(true, [civic, accord])
    model.getState().start()
    model.getState().addCar()
    model.getState().carAdded('v-new')
    notifier.tap('v-civic')
    expect(model.getState().selectedVehicleId).toBe('v-civic')
  })

  it('ignores a tapped reminder about a car the owner does not have', () => {
    const { model, notifier } = setup(true, [civic, accord])
    model.getState().start()
    notifier.tap('someone-elses-car')
    expect(model.getState().selectedVehicleId).toBe('v-accord')
  })

  it('opens nothing from a reminder tapped while signed out', () => {
    const { model, notifier } = setup(false)
    model.getState().start()
    notifier.tap('v-civic')
    expect(model.getState().status).toBe('signed-out')
  })

  it('opens on the garage tab and switches tabs', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    expect(model.getState().tab).toBe('garage')
    model.getState().openTab('log')
    expect(model.getState().tab).toBe('log')
  })

  it('goes back from Ask to the quote it was asked from, then to the car', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().openTab('car')
    model.getState().openTab('quote')
    model.getState().openTab('ask')
    model.getState().back()
    expect(model.getState().tab).toBe('quote')
    model.getState().back()
    expect(model.getState().tab).toBe('car')
    model.getState().back()
    expect(model.getState().tab).toBe('garage')
  })

  it('goes back from Ask to the code it was asked about, then to the car', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().openTab('car')
    model.getState().openTab('codes')
    model.getState().openTab('ask')
    model.getState().back()
    expect(model.getState().tab).toBe('codes')
    model.getState().back()
    expect(model.getState().tab).toBe('car')
  })

  it('forgets where Ask was opened from once the owner switches tabs', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().openTab('car')
    model.getState().openTab('ask')
    model.getState().openTab('log')
    model.getState().openTab('ask')
    model.getState().back()
    expect(model.getState().tab).toBe('log')
    model.getState().back()
    expect(model.getState().tab).toBe('garage')
  })

  it("goes back with the system gesture as each page's back button does", () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().openTab('car')
    model.getState().openTab('fuel')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('car')
    model.getState().openTab('renewals')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('car')
    model.getState().openTab('driving')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('car')
    model.getState().openTab('quote')
    model.getState().openTab('ask')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('quote')
    model.getState().openTab('account')
    model.getState().openTab('data')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('account')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('garage')
  })

  it('lets the system gesture close the app from the garage', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    expect(model.getState().systemBack()).toBe(false)
    expect(model.getState().tab).toBe('garage')
  })

  it('closes "add your car" with the system gesture, staying on the same page', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().openTab('car')
    model.getState().addCar()
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().addingCar).toBe(false)
    expect(model.getState().tab).toBe('car')
  })

  it('steps back from your data to the account to the first screen before any car is added', () => {
    const { model } = setup(true, [])
    model.getState().start()
    expect(model.getState().status).toBe('no-vehicles')
    model.getState().openTab('account')
    model.getState().openTab('data')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('account')
    expect(model.getState().systemBack()).toBe(true)
    expect(model.getState().tab).toBe('garage')
    expect(model.getState().systemBack()).toBe(false)
  })

  it('leaves the system gesture to close the app while signed out or starting', () => {
    const { model } = setup(false)
    expect(model.getState().systemBack()).toBe(false)
    model.getState().start()
    expect(model.getState().systemBack()).toBe(false)
  })

  it("opens a car's page from the garage, selecting that car", () => {
    const { model } = setup(true, [civic, accord])
    model.getState().start()
    model.getState().openCar('v-civic')
    expect(model.getState()).toMatchObject({ tab: 'car', selectedVehicleId: 'v-civic' })
  })

  it('stays put when asked to open a car the owner does not have', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().openCar('v-unknown')
    expect(model.getState()).toMatchObject({ tab: 'garage', selectedVehicleId: 'v-civic' })
  })

  it('goes back to the garage after signing out and in again', async () => {
    const { auth, model } = setup(true, [civic])
    model.getState().start()
    model.getState().openTab('car')
    await model.getState().signOut()
    await auth.sendCode('a@example.com')
    await auth.verifyCode('a@example.com', '123456')
    expect(model.getState().tab).toBe('garage')
  })

  it('opens the service log form for a task, and forgets the request on leaving', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().logService('oil')
    expect(model.getState()).toMatchObject({ tab: 'log', logRequest: { itemId: 'oil', seq: 1 } })
    model.getState().logService('oil')
    expect(model.getState().logRequest?.seq).toBe(2)
    model.getState().openTab('garage')
    expect(model.getState().logRequest).toBeUndefined()
  })

  it('forgets a request to log a service once the form has opened for it', () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().logService('oil')
    model.getState().logRequestHandled()
    expect(model.getState()).toMatchObject({ tab: 'log', logRequest: undefined })
    model.getState().logService('tires')
    expect(model.getState().logRequest).toEqual({ itemId: 'tires', seq: 2 })
  })

  it("opens a car's page with its odometer editor, and forgets the request once handled", () => {
    const { model } = setup(true, [civic, accord])
    model.getState().start()
    model.getState().updateOdometer('v-accord')
    expect(model.getState()).toMatchObject({
      tab: 'car',
      selectedVehicleId: 'v-accord',
      odometerRequest: { seq: 1 },
    })
    model.getState().odometerRequestHandled()
    expect(model.getState().odometerRequest).toBeUndefined()
    model.getState().updateOdometer('v-unknown')
    expect(model.getState().odometerRequest).toBeUndefined()
    model.getState().updateOdometer('v-civic')
    model.getState().openTab('garage')
    expect(model.getState().odometerRequest).toBeUndefined()
  })
})
