import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../../domain/types'
import { memoryVehicles } from '../../testing'
import { createArrangeCarsModel } from './model'

const car = (id: string, nickname: string, model: string): Vehicle => ({
  id,
  year: 2020,
  make: 'Honda',
  model,
  nickname,
  severeDuty: false,
})

const accord = car('a', 'Accord', 'Accord')
const civic = car('c', 'Commuter', 'Civic')
const fit = car('f', 'Fit', 'Fit')

const setup = (cars = [accord, civic, fit]) => {
  const vehicles = memoryVehicles(cars)
  const model = createArrangeCarsModel({ cars, vehicles })
  model.getState().open()
  const order = () => model.getState().form?.cars.map((c) => c.id)
  return { model, vehicles, order }
}

describe('arrange cars model', () => {
  it("lists the cars as the garage does, each with what it is when that isn't its name", () => {
    const { model } = setup()
    expect(model.getState().form?.cars).toEqual([
      { id: 'a', title: 'Accord', detail: '2020 Honda Accord' },
      { id: 'c', title: 'Commuter', detail: '2020 Honda Civic' },
      { id: 'f', title: 'Fit', detail: '2020 Honda Fit' },
    ])
  })

  it('names a car with no nickname by what it is', () => {
    const { model } = setup([{ ...accord, nickname: '' }, civic])
    expect(model.getState().form?.cars[0]).toEqual({
      id: 'a',
      title: '2020 Honda Accord',
      detail: '',
    })
  })

  it('moves a car up or down one place, and no further than the ends', () => {
    const { model, order } = setup()
    model.getState().moveUp('f')
    expect(order()).toEqual(['a', 'f', 'c'])
    model.getState().moveDown('a')
    expect(order()).toEqual(['f', 'a', 'c'])
    model.getState().moveUp('f')
    model.getState().moveDown('c')
    expect(order()).toEqual(['f', 'a', 'c'])
  })

  it('saves the new order for every phone and closes', async () => {
    const { model, vehicles } = setup()
    model.getState().moveUp('c')
    expect(await model.getState().save()).toBe(true)
    expect(model.getState().form).toBeUndefined()
    expect(await vehicles.get('c')).toMatchObject({ garagePosition: 0 })
    expect(await vehicles.get('a')).toMatchObject({ garagePosition: 1 })
    expect(await vehicles.get('f')).toMatchObject({ garagePosition: 2 })
  })

  it('closes without writing when nothing moved', async () => {
    const { model, vehicles } = setup()
    expect(await model.getState().save()).toBe(true)
    expect(model.getState().form).toBeUndefined()
    expect((await vehicles.get('a'))?.garagePosition).toBeUndefined()
  })

  it('keeps the sheet open with the order when saving fails', async () => {
    const { model, vehicles, order } = setup()
    model.getState().moveUp('c')
    vehicles.failNextAdd('offline')
    expect(await model.getState().save()).toBe(false)
    expect(order()).toEqual(['c', 'a', 'f'])
    expect(model.getState().form?.error).toBe("Couldn't save the order. Try again.")
    expect(model.getState().form?.saving).toBe(false)
  })

  it('ignores moves and closing while saving', async () => {
    const { model, order } = setup()
    model.getState().moveUp('c')
    const saving = model.getState().save()
    model.getState().moveUp('f')
    model.getState().close()
    expect(order()).toEqual(['c', 'a', 'f'])
    expect(await saving).toBe(true)
  })

  it('throws away the moves when closed', () => {
    const { model, order } = setup()
    model.getState().moveUp('c')
    model.getState().close()
    model.getState().open()
    expect(order()).toEqual(['a', 'c', 'f'])
  })
})
