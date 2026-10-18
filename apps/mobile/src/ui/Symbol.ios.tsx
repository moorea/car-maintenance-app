import { Icon } from '@expo/ui'
import { accessibilityHidden } from '@expo/ui/swift-ui/modifiers'
import { SYMBOLS, type SymbolName } from './symbols'

interface Props {
  name: SymbolName
  size?: number
  color: string
}

/**
 * An icon, drawn as its SF Symbol. Icons sit beside text or inside a labelled button, so VoiceOver
 * skips them rather than reading the symbol's name ("plus", "bell.fill").
 */
export function Symbol({ name, size = 22, color }: Props) {
  return (
    <Icon name={SYMBOLS[name].ios} size={size} color={color} modifiers={[accessibilityHidden()]} />
  )
}
