import { Box } from '@expo/ui/jetpack-compose'
import { semantics } from '@expo/ui/jetpack-compose/modifiers'
import { StatusDots, type StatusDotsProps } from './StatusDots'

/** The shared number and dots, read out by TalkBack as one element with the label. */
export function StatusRing(props: StatusDotsProps) {
  return (
    <Box contentAlignment="center" modifiers={[semantics({ contentDescription: props.label })]}>
      <StatusDots {...props} />
    </Box>
  )
}
