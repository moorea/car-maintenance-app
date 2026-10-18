import { describe, expect, it } from 'vitest'
import { bodyStyleOfClass, isBodyStyle, isPaint } from './appearance'

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
