// The number sits inside a ring of fixed size, so it stays a fixed size too, as on iOS.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Column, Row, Text } from '@expo/ui'
import { Box } from '@expo/ui/jetpack-compose'
import { offset, semantics, size as sizeModifier } from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import { RING_THICKNESS, type StatusRingProps } from './StatusRing'

/**
 * A ring of coloured dots around a number, one per segment, clockwise from the top. Compose has no
 * chart, and circular progress indicators stacked into a ring were not reliably drawn, so each dot
 * is a plain filled shape moved out from the centre.
 */
export function StatusRing({ segments, count, caption, label, size = 200 }: StatusRingProps) {
  const colors = useColors()
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  // Dots shrink when there are many, so neighbours keep a gap between them.
  const room = (Math.PI * size) / shown.length
  const dot = Math.max(4, Math.min(size * RING_THICKNESS, room * 0.6))
  const radius = (size - dot) / 2
  return (
    <Box
      contentAlignment="center"
      modifiers={[sizeModifier(size, size), semantics({ contentDescription: label })]}
    >
      {shown.map((s, i) => {
        const angle = ((i + 0.5) / shown.length) * 2 * Math.PI - Math.PI / 2
        return (
          <Row
            key={s.key}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: colors[s.color],
            }}
            modifiers={[offset(radius * Math.cos(angle), radius * Math.sin(angle))]}
          />
        )
      })}
      <Column alignment="center" spacing={0}>
        <Text textStyle={{ fontSize: 56, fontWeight: '700', color: colors.textPrimary }}>
          {String(count)}
        </Text>
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
      </Column>
    </Box>
  )
}
