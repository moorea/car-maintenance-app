import { describe, expect, it } from 'vitest'
import { carHotspots, spotOfComponent, spotOfItem } from './carSpots'

describe('spotOfItem', () => {
  it.each([
    [{ kind: 'engine-oil', task: 'Oil change' }, 'hood'],
    [{ kind: 'tire-rotation', task: 'Rotate tires' }, 'wheels'],
    [{ kind: 'cabin-air-filter', task: 'Cabin filter' }, 'cabin'],
    [{ kind: 'transmission-fluid', task: 'ATF' }, 'underbody'],
    [{ kind: 'wiper-blades', task: 'Wipers' }, 'glass'],
  ])('places %o at %s by its kind', (item, spot) => {
    expect(spotOfItem(item)).toBe(spot)
  })

  it('places an item the owner added by its name', () => {
    expect(spotOfItem({ task: 'Replace brake pads' })).toBe('wheels')
    expect(spotOfItem({ task: 'Headlight restoration' })).toBe('lights')
  })

  it('leaves out an item that is nowhere in particular', () => {
    expect(spotOfItem({ kind: 'inspection', task: 'Multi-point inspection' })).toBeUndefined()
    expect(spotOfItem({ task: 'Boat trailer bearings' })).toBeUndefined()
  })
})

describe('spotOfComponent', () => {
  it.each([
    ['ENGINE AND ENGINE COOLING:ENGINE', 'hood'],
    ['SERVICE BRAKES, HYDRAULIC:ANTILOCK', 'wheels'],
    ['AIR BAGS', 'cabin'],
    ['FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP', 'underbody'],
    ['EXTERIOR LIGHTING:HEADLIGHTS', 'lights'],
    ['VISIBILITY:WINDSHIELD WIPER/WASHER', 'glass'],
    ['LATCHES/LOCKS/LINKAGES:DOORS', 'body'],
  ])('places %s at %s', (component, spot) => {
    expect(spotOfComponent(component)).toBe(spot)
  })

  it('places a recall naming several components by the first', () => {
    expect(spotOfComponent('AIR BAGS; SEAT BELTS; STEERING')).toBe('cabin')
  })

  it('leaves out a component it does not know, or none', () => {
    expect(spotOfComponent('UNKNOWN OR OTHER')).toBeUndefined()
    expect(spotOfComponent(undefined)).toBeUndefined()
  })
})

describe('carHotspots', () => {
  const item = (itemId: string, status: 'overdue' | 'due-soon' | 'upcoming', spot?: 'hood') => ({
    itemId,
    task: itemId,
    status,
    spot,
  })

  it('pins each place with something there, in a fixed order, the most urgent item first', () => {
    const spots = carHotspots(
      [
        { itemId: 'rotate', task: 'Rotate tires', status: 'upcoming', spot: 'wheels' },
        { itemId: 'air', task: 'Air filter', status: 'upcoming', spot: 'hood' },
        { itemId: 'oil', task: 'Oil change', status: 'due-soon', spot: 'hood' },
      ],
      [],
    )
    expect(spots.map((s) => [s.spot, s.attention, s.itemIds, s.summary])).toEqual([
      ['hood', 'due-soon', ['oil', 'air'], 'Due soon: Oil change'],
      ['wheels', 'fine', ['rotate'], 'Nothing due'],
    ])
  })

  it('marks a place with an open recall above anything overdue, and counts both', () => {
    const [hood] = carHotspots(
      [item('oil', 'overdue', 'hood'), item('plugs', 'due-soon', 'hood')],
      [{ id: 'r1', spot: 'hood' }],
    )
    expect(hood).toMatchObject({
      attention: 'recall',
      recallIds: ['r1'],
      summary: '1 open recall · 1 overdue · 1 due soon',
    })
  })

  it('counts several overdue items rather than naming one', () => {
    const [hood] = carHotspots([item('oil', 'overdue', 'hood'), item('air', 'overdue', 'hood')], [])
    expect(hood?.summary).toBe('2 overdue')
  })

  it('leaves out items and recalls with no place, which the Service list still shows', () => {
    expect(carHotspots([item('inspect', 'overdue')], [{ id: 'r1' }])).toEqual([])
  })
})
