import { Icon } from '@expo/ui'
import { accessibilityHidden, frame } from '@expo/ui/swift-ui/modifiers'
import { SYMBOLS, leadingWidth, type SymbolName } from './symbols'

interface Props {
  name: SymbolName
  size?: number
  color: string
  /**
   * The icon leads a row of text. SF Symbols are as wide as their drawing (the engine is wider
   * than the shield), so a leading icon sits in a fixed-width slot to line up the text of rows
   * stacked above and below it.
   */
  leading?: boolean
}

/**
 * An icon, drawn as its SF Symbol. Icons sit beside text or inside a labelled button, so VoiceOver
 * skips them rather than reading the symbol's name ("plus", "bell.fill").
 */
export function Symbol({ name, size = 22, color, leading }: Props) {
  const modifiers = [accessibilityHidden()]
  if (leading) modifiers.push(frame({ width: leadingWidth(size) }))
  return <Icon name={SYMBOLS[name].ios} size={size} color={color} modifiers={modifiers} />
}
