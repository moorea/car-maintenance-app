/** The iOS text styles that scale with the reader's Dynamic Type setting. */
export type TextStyleName =
  | 'largeTitle'
  | 'title'
  | 'title2'
  | 'title3'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption'
  | 'caption2'

// Each style's size at the default Dynamic Type setting, largest first.
const DEFAULT_SIZES: [TextStyleName, number][] = [
  ['largeTitle', 34],
  ['title', 28],
  ['title2', 22],
  ['title3', 20],
  ['body', 17],
  ['callout', 16],
  ['subheadline', 15],
  ['footnote', 13],
  ['caption', 12],
  ['caption2', 11],
]

/**
 * The text style whose default size is nearest `fontSize`, so text drawn at that size grows and
 * shrinks with Dynamic Type. A size halfway between two styles takes the larger.
 */
export function dynamicTypeStyle(fontSize: number): TextStyleName {
  let best = DEFAULT_SIZES[0] as [TextStyleName, number]
  for (const entry of DEFAULT_SIZES) {
    if (Math.abs(entry[1] - fontSize) < Math.abs(best[1] - fontSize)) best = entry
  }
  return best[0]
}

// React Native's iOS font scale for the largest standard size (xxxLarge). The accessibility
// sizes start at about 1.79.
const LARGEST_STANDARD_SCALE = 1.353

/** Whether the reader picked one of the larger accessibility text sizes, where rows of text
 * no longer fit side by side. */
export function isAccessibilityTextSize(fontScale: number): boolean {
  return fontScale > LARGEST_STANDARD_SCALE
}
