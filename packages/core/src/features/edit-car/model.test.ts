import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../../domain/types'
import { memoryVehicles, OWNER } from '../../testing'
import { createEditCarModel } from './model'

const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}
const other: Vehicle = { ...car, id: 'v2', nickname: 'Civic', make: 'Honda', model: 'Civic' }

const setup = () => {
  const vehicles = memoryVehicles([car, other])
  const model = createEditCarModel({ vehicle: car, vehicles })
  const garage = () => {
    let names: string[] = []
    vehicles.watchOwned(OWNER, (v) => (names = v.map((x) => x.nickname)))()
    return names
  }
  return { vehicles, model, garage }
}

describe('edit car', () => {
  it('opens with the car’s current name', () => {
    const { model } = setup()
    model.getState().open()
    expect(model.getState().title).toBe('2021 Toyota RAV4')
    expect(model.getState().form).toMatchObject({ nickname: 'RAV4', confirmingRemove: false })
  })

  it('renames the car, trimming spaces, and closes', async () => {
    const { model, garage } = setup()
    model.getState().open()
    model.getState().setNickname('  Mom’s car ')
    expect(await model.getState().save()).toBe(true)
    expect(garage()).toEqual(['Mom’s car', 'Civic'])
    expect(model.getState().form).toBeUndefined()
  })

  it('refuses a blank name or one too long for the garage', async () => {
    const { model, garage } = setup()
    model.getState().open()
    model.getState().setNickname('   ')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().form?.nicknameError).toBe('Give the car a name')
    model.getState().setNickname('x'.repeat(41))
    expect(model.getState().form?.nicknameError).toBeUndefined()
    await model.getState().save()
    expect(model.getState().form?.nicknameError).toBe('Keep the name to 40 characters')
    expect(garage()).toEqual(['RAV4', 'Civic'])
  })

  it('closes without writing when the name is unchanged', async () => {
    const { model, vehicles } = setup()
    vehicles.failNextAdd('should not be called')
    model.getState().open()
    expect(await model.getState().save()).toBe(true)
    expect(model.getState().form).toBeUndefined()
  })

  it('keeps the sheet open with the name typed when saving fails', async () => {
    const { model, vehicles } = setup()
    model.getState().open()
    model.getState().setNickname('Daily')
    vehicles.failNextAdd('offline')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().form).toMatchObject({
      nickname: 'Daily',
      saving: false,
      error: "Couldn't save the name. Try again.",
    })
  })

  it('asks to confirm before removing, and removes only the second time', async () => {
    const { model, garage } = setup()
    model.getState().open()
    expect(await model.getState().remove()).toBe(false)
    expect(model.getState().form?.confirmingRemove).toBe(true)
    expect(garage()).toEqual(['RAV4', 'Civic'])

    expect(await model.getState().remove()).toBe(true)
    expect(garage()).toEqual(['Civic'])
    expect(model.getState().form).toBeUndefined()
  })

  it('stops asking to confirm once the owner edits the name instead', async () => {
    const { model, garage } = setup()
    model.getState().open()
    await model.getState().remove()
    model.getState().setNickname('Daily')
    expect(model.getState().form?.confirmingRemove).toBe(false)
    await model.getState().remove()
    expect(garage()).toEqual(['RAV4', 'Civic'])
  })

  it('says so when removing fails, and asks again before the next try', async () => {
    const { model, vehicles, garage } = setup()
    model.getState().open()
    await model.getState().remove()
    vehicles.failNextAdd('offline')
    expect(await model.getState().remove()).toBe(false)
    expect(model.getState().form).toMatchObject({
      removing: false,
      confirmingRemove: false,
      error: "Couldn't remove the car. Try again.",
    })
    expect(garage()).toEqual(['RAV4', 'Civic'])
  })

  it('closes when swiped away mid-removal, stays closed after it, and opens again only once it ends', async () => {
    const vehicles = memoryVehicles([car])
    let finish = () => {}
    const slow = {
      rename: vehicles.rename,
      remove: (id: string) =>
        new Promise<void>((resolve) => {
          finish = () => void vehicles.remove(id).then(resolve)
        }),
    }
    const model = createEditCarModel({ vehicle: car, vehicles: slow })
    model.getState().open()
    await model.getState().remove()
    const removing = model.getState().remove()
    model.getState().close()
    expect(model.getState().form).toBeUndefined()
    model.getState().open()
    expect(model.getState().form).toBeUndefined()
    finish()
    expect(await removing).toBe(true)
    model.getState().open()
    expect(model.getState().form).toBeDefined()
  })

  it('cannot be changed while a removal is running', async () => {
    const vehicles = memoryVehicles([car])
    let finish = () => {}
    const slow = {
      rename: vehicles.rename,
      remove: (id: string) =>
        new Promise<void>((resolve) => {
          finish = () => void vehicles.remove(id).then(resolve)
        }),
    }
    const model = createEditCarModel({ vehicle: car, vehicles: slow })
    model.getState().open()
    await model.getState().remove()
    const removing = model.getState().remove()
    expect(model.getState().form?.removing).toBe(true)
    model.getState().setNickname('Other')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().form).toMatchObject({ nickname: 'RAV4', removing: true })
    finish()
    expect(await removing).toBe(true)
    expect(model.getState().form).toBeUndefined()
  })
})
