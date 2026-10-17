import { describe, expect, it } from 'vitest'
import { componentLabel, recallLookupUrl } from './nhtsa'

describe('componentLabel', () => {
  it('turns upper case into a sentence', () => {
    expect(componentLabel('SERVICE BRAKES, HYDRAULIC')).toBe('Service brakes, hydraulic')
  })

  it('separates levels and keeps words with digits', () => {
    expect(componentLabel('ELECTRICAL SYSTEM: 12V/24V/48V BATTERY: CABLES')).toBe(
      'Electrical system: 12V/24V/48V battery: cables',
    )
  })

  it('keeps acronyms', () => {
    expect(componentLabel('SERVICE BRAKES, AIR:ANTILOCK/ABS')).toBe(
      'Service brakes, air: antilock/ABS',
    )
  })
})

describe('recallLookupUrl', () => {
  it("links to NHTSA's lookup for the car's VIN", () => {
    expect(recallLookupUrl('1HGCM82633A004352')).toBe(
      'https://www.nhtsa.gov/recalls?vin=1HGCM82633A004352',
    )
  })

  it('links to the search page without a VIN', () => {
    expect(recallLookupUrl()).toBe('https://www.nhtsa.gov/recalls')
  })
})
