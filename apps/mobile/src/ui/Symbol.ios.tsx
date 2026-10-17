import { Icon } from '@expo/ui'
import { SYMBOLS, type SymbolName } from './symbols'

interface Props {
  name: SymbolName
  size?: number
  color: string
}

/** An icon, drawn as its SF Symbol. */
export function Symbol({ name, size = 22, color }: Props) {
  return <Icon name={SYMBOLS[name].ios} size={size} color={color} />
}
