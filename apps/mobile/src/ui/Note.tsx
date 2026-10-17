import { Text } from '@expo/ui'
import { useColors } from '../theme'

/** Small secondary text: hints, sources, empty states. */
export function Note({ children }: { children: string }) {
  const colors = useColors()
  return <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{children}</Text>
}

/** A message saying what went wrong. */
export function ErrorText({ children }: { children: string }) {
  const colors = useColors()
  return <Text textStyle={{ color: colors.danger }}>{children}</Text>
}
