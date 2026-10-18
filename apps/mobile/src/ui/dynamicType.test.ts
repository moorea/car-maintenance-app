import { describe, expect, it } from 'vitest'
import { dynamicTypeStyle } from './dynamicType'

describe('dynamicTypeStyle', () => {
  it.each([
    [34, 'largeTitle'],
    [17, 'body'],
    [16, 'callout'],
    [13, 'footnote'],
    [11, 'caption2'],
  ] as const)('maps %ipt to %s, the style drawn at that size by default', (size, style) => {
    expect(dynamicTypeStyle(size)).toBe(style)
  })

  it('maps a size between styles to the nearest one', () => {
    expect(dynamicTypeStyle(24)).toBe('title2')
    expect(dynamicTypeStyle(26)).toBe('title')
    expect(dynamicTypeStyle(30)).toBe('title')
  })

  it('maps a size halfway between two styles to the larger', () => {
    expect(dynamicTypeStyle(14)).toBe('subheadline')
  })

  it('maps sizes outside the scale to its ends', () => {
    expect(dynamicTypeStyle(8)).toBe('caption2')
    expect(dynamicTypeStyle(48)).toBe('largeTitle')
  })
})
