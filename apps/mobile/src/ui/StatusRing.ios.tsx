import { VStack } from '@expo/ui/swift-ui'
import { accessibilityElement, accessibilityLabel } from '@expo/ui/swift-ui/modifiers'
import { StatusDots, type StatusDotsProps } from './StatusDots'

/** The shared number and dots, read out by VoiceOver as one element with the label. */
export function StatusRing(props: StatusDotsProps) {
  return (
    <VStack modifiers={[accessibilityElement('ignore'), accessibilityLabel(props.label)]}>
      <StatusDots {...props} />
    </VStack>
  )
}
