import { describe, expect, it } from 'vitest'
import { identifyService, identifyServices } from './identifyService'

describe('identifying what a quote line is', () => {
  it.each([
    ['Lube, oil & filter', 'engine-oil'],
    ['Full synthetic 0W-20 oil change', 'engine-oil'],
    ['Engine oil and filter', 'engine-oil'],
    ['Rotate & balance tires', 'tire-rotation'],
    ['Replace cabin air filter', 'cabin-air-filter'],
    ['Engine air filter', 'engine-air-filter'],
    ['Brake fluid exchange', 'brake-fluid'],
    ['Brake system flush', 'brake-fluid'],
    ['Inspect brakes', 'brake-inspection'],
    ['Front brake pads', 'brake-pads'],
    ['Resurface rotors', 'brake-rotors'],
    ['Transmission fluid service', 'transmission-fluid'],
    ['CVT fluid exchange', 'transmission-fluid'],
    ['Front & rear differential fluid', 'differential-fluid'],
    ['Transfer case fluid', 'transfer-case-fluid'],
    ['Coolant flush', 'engine-coolant'],
    ['Replace spark plugs', 'spark-plugs'],
    ['Fuel injection cleaning', 'fuel-system-cleaning'],
    ['Throttle body service', 'fuel-system-cleaning'],
    ['BG induction service', 'fuel-system-cleaning'],
    ['Power steering flush', 'power-steering-fluid'],
    ['Engine flush', 'engine-flush'],
    ['Nitrogen tire fill', 'nitrogen-fill'],
    ['Battery test', 'battery-test'],
    ['Replace battery', 'battery'],
    ['Wiper blades', 'wiper-blades'],
    ['Four-wheel alignment', 'wheel-alignment'],
    ['Timing belt and water pump', 'timing-belt'],
    ['Perform recall 24V123000', 'recall'],
    ['Oil leak at valve cover gasket', 'repair'],
    ['Diagnose check engine light', 'repair'],
    ['30K mile service', 'service-package'],
    ['60,000 mile maintenance', 'service-package'],
    ['5,000 mile oil change', 'engine-oil'],
    ['Synthetic oil change (5k)', 'engine-oil'],
    ['60k timing belt', 'timing-belt'],
    ['Recommended at 30,000 mi: brake fluid flush', 'brake-fluid'],
    ['Ignition coil replacement', 'repair'],
    ['Transmission mount', 'repair'],
    ['Brake caliper service', 'repair'],
    ['Replace rear brake hoses', 'repair'],
    ['Air conditioning filter', 'cabin-air-filter'],
    ['Tire balance', 'wheel-balance'],
    ['Tire pressure check', 'tire-pressure'],
    ['Clean battery terminals', 'battery-terminals'],
  ])('reads "%s" as %s', (text, kind) => {
    expect(identifyService(text)).toBe(kind)
  })

  it('does not guess at lines it cannot place', () => {
    expect(identifyService('Multi-point inspection')).toBeUndefined()
    expect(identifyService('Car wash')).toBeUndefined()
  })
})

describe('identifying every job on a quote line', () => {
  it.each([
    ['Oil change + tire rotation', ['engine-oil', 'tire-rotation']],
    ['Engine oil and filter, rotate tires', ['engine-oil', 'tire-rotation']],
    ['Cabin & engine air filters', ['cabin-air-filter', 'engine-air-filter']],
    ['Air filter and cabin filter', ['engine-air-filter', 'cabin-air-filter']],
    ['Replace wiper blades and cabin air filter', ['wiper-blades', 'cabin-air-filter']],
    ['Mount and balance 4 tires', ['wheel-balance']],
  ])('reads "%s" as %j', (text, kinds) => {
    expect(identifyServices(text)).toEqual(kinds)
  })

  it('counts a job named twice once', () => {
    expect(identifyServices('Lube, oil & filter')).toEqual(['engine-oil'])
  })

  it('keeps thousands together and A/C as one word', () => {
    expect(identifyServices('60,000 mile maintenance')).toEqual(['service-package'])
    expect(identifyServices('A/C performance check')).toEqual(['ac-service'])
  })

  it('judges a package by the jobs it lists', () => {
    expect(identifyServices('30K service: oil change, rotate tires')).toEqual([
      'engine-oil',
      'tire-rotation',
    ])
  })

  it('finds nothing in a line it cannot place', () => {
    expect(identifyServices('Multi-point inspection')).toEqual([])
  })
})
