// The number sits inside a ring of fixed size, so it stays a fixed size too, as on iOS.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Column, Text } from '@expo/ui'
import { Box, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { rotate, semantics, size as sizeModifier } from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import { RING_THICKNESS, type StatusRingProps } from './StatusRing'

// The gap between segments, in degrees.
const GAP = 4

// How many arcs the ring always holds. Compose stopped drawing a ring whose arcs were added or
// reordered after it first appeared (as when recalls arrive), so the arcs stay put and only their
// colour and length change; unused ones have no length. Past this many segments, the rest are left
// off, which are the latest-due items since recalls and overdue items come first.
const SLOTS = 36

/**
 * A ring of coloured segments around a number. Compose has no chart, so each segment is a
 * determinate circular progress indicator covering its share of the ring, turned to its place.
 */
export function StatusRing({ segments, count, caption, label, size = 200 }: StatusRingProps) {
  const colors = useColors()
  const thickness = Math.round(size * RING_THICKNESS)
  const shown = (
    segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  ).slice(0, SLOTS)
  const share = 360 / shown.length
  const gap = shown.length > 1 ? GAP : 0
  return (
    <Box
      contentAlignment="center"
      modifiers={[sizeModifier(size, size), semantics({ contentDescription: label })]}
    >
      {Array.from({ length: SLOTS }, (_, i) => {
        const s = shown[i]
        return (
          <CircularProgressIndicator
            key={i}
            progress={s ? (share - gap) / 360 : 0}
            color={s ? colors[s.color] : colors.clear}
            trackColor={colors.clear}
            strokeWidth={thickness}
            strokeCap="butt"
            gapSize={0}
            modifiers={[sizeModifier(size, size), rotate(s ? i * share + gap / 2 : 0)]}
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
