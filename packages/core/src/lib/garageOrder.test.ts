import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../domain/types'
import { byGarageOrder } from './garageOrder'

const car = (nickname: string, garagePosition?: number): Vehicle => ({
  id: nickname,
  year: 2020,
  make: 'Honda',
  model: 'Civic',
  nickname,
  severeDuty: false,
  ...(garagePosition !== undefined && { garagePosition }),
})

describe('garage order', () => {
  it('lists cars by name until the owner arranges them', () => {
    expect([car('Zed'), car('Alpha')].sort(byGarageOrder).map((c) => c.id)).toEqual([
      'Alpha',
      'Zed',
    ])
  })

  it('puts arranged cars first, in their order, and then the rest by name', () => {
    const cars = [car('Beta'), car('Zed', 1), car('Alpha'), car('Yak', 0)]
    expect(cars.sort(byGarageOrder).map((c) => c.id)).toEqual(['Yak', 'Zed', 'Alpha', 'Beta'])
  })
})
