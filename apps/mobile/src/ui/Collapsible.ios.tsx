import type { CollapsibleProps } from '@expo/ui'
import { DisclosureGroup } from '@expo/ui/swift-ui'
import { Text } from './Text'

/**
 * Expo UI's Collapsible, except that its label is drawn by our Text, so it follows the reader's
 * Dynamic Type setting like the rest of the screen.
 */
export function Collapsible({
  isOpen,
  onOpenChange,
  label = '',
  labelStyle,
  children,
}: CollapsibleProps) {
  return (
    <DisclosureGroup isExpanded={isOpen} onIsExpandedChange={onOpenChange}>
      <DisclosureGroup.Label>
        <Text {...(labelStyle ? { textStyle: labelStyle } : {})}>{label}</Text>
      </DisclosureGroup.Label>
      {children}
    </DisclosureGroup>
  )
}
