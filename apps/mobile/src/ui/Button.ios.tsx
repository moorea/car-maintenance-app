import { Button as UniversalButton, type ButtonProps } from '@expo/ui'
import { buttonStyle } from '@expo/ui/swift-ui/modifiers'

/**
 * Expo UI's button, with text buttons drawn in the accent like an iOS link. Expo UI gives them the
 * `plain` style, which ignores the tint and draws the label in the text colour, so "Full schedule"
 * or "Privacy policy" read as plain text. `borderless` is the tinted, unbordered style.
 */
export function Button(props: ButtonProps) {
  const ownStyle = props.modifiers?.some((m) => m.$type === 'buttonStyle')
  if (props.variant !== 'text' || ownStyle) return <UniversalButton {...props} />
  return (
    <UniversalButton
      {...props}
      modifiers={[buttonStyle('borderless'), ...(props.modifiers ?? [])]}
    />
  )
}
