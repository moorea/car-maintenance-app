import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../../domain/types'
import { memoryAuth, memorySync, memoryVehicles } from '../../testing'
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
  const model = createSessionModel({ auth, vehicles, sync })
  return { auth, vehicles, sync, model }
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

  it('does not open "add your car" for someone signed out, and closes it on sign-out', async () => {
    const { model } = setup(true, [civic])
    model.getState().start()
    model.getState().addCar()
    await model.getState().signOut()
    expect(model.getState().addingCar).toBe(false)
    model.getState().addCar()
    expect(model.getState().addingCar).toBe(false)
  })
})
