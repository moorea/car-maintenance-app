import { describe, expect, it } from 'vitest'
import { componentsForText } from './components'

describe('componentsForText', () => {
  it.each([
    ['Front brake pads & rotors', ['SERVICE BRAKES']],
    ['CVT fluid exchange', ['POWER TRAIN']],
    ['Replace water pump and thermostat', ['ENGINE']],
    ['Replace 12V battery', ['ELECTRICAL SYSTEM']],
    ['Front struts and control arm bushings', ['SUSPENSION']],
    ['A/C recharge', ['VISIBILITY']],
  ])('knows "%s" is about %j', (text, components) => {
    expect(componentsForText(text)).toEqual(components)
  })

  it('names every part a line mentions', () => {
    expect(componentsForText('Replace wheel bearing and tie rod end')).toEqual([
      'STEERING',
      'WHEELS',
    ])
  })

  it('names nothing for a line about no part', () => {
    expect(componentsForText('Multi-point inspection')).toEqual([])
  })
})
