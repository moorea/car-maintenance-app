import { SYMBOLS, type SymbolName } from './symbols'

interface Props {
  name: SymbolName
  size?: number
  color: string
  /** The icon leads a row of text. The drawings are square, so a leading icon already lines rows up. */
  leading?: boolean
}

/** An icon. On the web preview it is an inline stroke drawing; iOS uses the SF Symbol. */
export function Symbol({ name, size = 22, color }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {SYMBOLS[name].paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
