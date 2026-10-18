import { describe, expect, it } from 'vitest'
import { bodyStyleOfClass, isBodyStyle, isPaint, shows3dCar } from './appearance'

describe('bodyStyleOfClass', () => {
  it.each([
    ['Sedan/Saloon', 'sedan'],
    ['Hatchback/Liftback/Notchback', 'sedan'],
    ['Coupe', 'sedan'],
    ['Convertible/Cabriolet', 'sedan'],
    ['Wagon', 'sedan'],
    ['Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', 'suv'],
    ['Crossover Utility Vehicle (CUV)', 'suv'],
    ['Pickup', 'pickup'],
    ['Minivan', 'minivan'],
    ['Van', 'minivan'],
    ['Cargo Van', 'minivan'],
  ])('draws a %s as a %s', (bodyClass, style) => {
    expect(bodyStyleOfClass(bodyClass)).toBe(style)
  })

  it.each([['Motorcycle - Standard'], ['Bus'], ['Trailer'], [''], [undefined]])(
    'leaves %s for the owner to pick',
    (bodyClass) => {
      expect(bodyStyleOfClass(bodyClass)).toBeUndefined()
    },
  )
})

describe('appearance values', () => {
  it('accepts only the body styles the app can draw', () => {
    expect(isBodyStyle('pickup')).toBe(true)
    expect(isBodyStyle('bus')).toBe(false)
    expect(isBodyStyle(3)).toBe(false)
  })

  it('accepts only the paints the app can draw', () => {
    expect(isPaint('red')).toBe(true)
    expect(isPaint('chartreuse')).toBe(false)
  })
})

describe('shows3dCar', () => {
  const phone = { reduceMotion: false, lowPower: false, capable: true }

  it('draws in 3D by default on a capable phone', () => {
    expect(shows3dCar(null, phone)).toBe(true)
  })

  it('draws the still view by default under Reduce Motion or low power', () => {
    expect(shows3dCar(null, { ...phone, reduceMotion: true })).toBe(false)
    expect(shows3dCar(null, { ...phone, lowPower: true })).toBe(false)
  })

  it("follows the owner's choice either way", () => {
    expect(shows3dCar(false, phone)).toBe(false)
    expect(shows3dCar(true, { ...phone, reduceMotion: true, lowPower: true })).toBe(true)
  })

  it('never draws in 3D on a phone too slow for it', () => {
    expect(shows3dCar(true, { ...phone, capable: false })).toBe(false)
  })
})
