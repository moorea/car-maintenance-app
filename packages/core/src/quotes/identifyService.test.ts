import { describe, expect, it } from 'vitest'
import { identifyService } from './identifyService'

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
  ])('reads "%s" as %s', (text, kind) => {
    expect(identifyService(text)).toBe(kind)
  })

  it('does not guess at lines it cannot place', () => {
    expect(identifyService('Multi-point inspection')).toBeUndefined()
    expect(identifyService('Car wash')).toBeUndefined()
  })
})
