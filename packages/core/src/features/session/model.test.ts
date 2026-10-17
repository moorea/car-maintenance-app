import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../../domain/types'
import { memoryAuth, memoryVehicles } from '../../testing'
import { createSessionModel } from './model'

const civic: Vehicle = { id: 'v-civic', configId: 'c1', nickname: 'Civic', severeDuty: false }
const accord: Vehicle = { id: 'v-accord', configId: 'c2', nickname: 'Accord', severeDuty: false }

const setup = (signedIn: boolean, owned: Vehicle[] = []) => {
  const auth = memoryAuth(signedIn ? { user: { id: 'u1', email: 'a@example.com' } } : {})
  const vehicles = memoryVehicles(owned)
  const model = createSessionModel({ auth, vehicles })
  return { auth, vehicles, model }
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
