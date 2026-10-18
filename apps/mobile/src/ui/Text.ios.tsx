import { Text as UniversalText, type TextProps, type UniversalFontWeight } from '@expo/ui'
import { font } from '@expo/ui/swift-ui/modifiers'
import { dynamicTypeStyle } from './dynamicType'

type Weight = NonNullable<Parameters<typeof font>[0]['weight']>

const WEIGHTS: Record<UniversalFontWeight, Weight> = {
  normal: 'regular',
  bold: 'bold',
  '100': 'ultraLight',
  '200': 'thin',
  '300': 'light',
  '400': 'regular',
  '500': 'medium',
  '600': 'semibold',
  '700': 'bold',
  '800': 'heavy',
  '900': 'black',
}

/**
 * Expo UI's Text, except that a `fontSize` becomes the nearest iOS text style, so the text follows
 * the reader's Dynamic Type setting. Expo UI would otherwise draw it at exactly that size, always.
 */
export function Text({ textStyle, modifiers, ...props }: TextProps) {
  if (textStyle?.fontSize === undefined || textStyle.fontFamily !== undefined)
    return (
      <UniversalText
        {...props}
        {...(textStyle ? { textStyle } : {})}
        {...(modifiers ? { modifiers } : {})}
      />
    )
  const { fontSize, fontWeight, ...rest } = textStyle
  const scaled = font({
    textStyle: dynamicTypeStyle(fontSize),
    ...(fontWeight ? { weight: WEIGHTS[fontWeight] } : {}),
  })
  return <UniversalText {...props} textStyle={rest} modifiers={[scaled, ...(modifiers ?? [])]} />
}
