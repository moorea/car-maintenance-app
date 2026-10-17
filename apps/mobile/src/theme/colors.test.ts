import { describe, expect, it } from 'vitest'
import { darkColors, lightColors, type ColorRole, type Colors } from './colors'

// WCAG 2 relative luminance and contrast ratio for #RRGGBB colours.
function luminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Expected an opaque #RRGGBB colour: ${hex}`)
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// Every pairing screens draw: text role on the fill it sits on.
const pairs: [text: ColorRole, fill: ColorRole][] = [
  ['textPrimary', 'background'],
  ['textPrimary', 'surface'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['accent', 'background'],
  ['accent', 'surface'],
  ['accent', 'accentSubtle'],
  ['onAccent', 'accent'],
  ['warning', 'surface'],
  ['warning', 'warningSubtle'],
  ['textPrimary', 'warningSubtle'],
  ['danger', 'background'],
  ['danger', 'surface'],
  ['danger', 'warningSubtle'],
  ['textSecondary', 'neutralSubtle'],
  ['textPrimary', 'neutralSubtle'],
]

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as [string, Colors][])('%s colours', (_, colors) => {
  it.each(pairs)('keep %s readable on %s (WCAG AA, 4.5:1)', (text, fill) => {
    expect(contrast(colors[text], colors[fill])).toBeGreaterThanOrEqual(4.5)
  })
})
