import type { SymbolName } from './symbols'

interface Props {
  name: SymbolName
  size?: number
  color: string
}

/** Android has no icon set wired up yet (it needs Material Symbols assets), so icons are omitted. */
export function Symbol(_props: Props) {
  return null
}
