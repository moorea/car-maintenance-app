// The number sits inside a ring of fixed size, so it stays a fixed size too, as on iOS.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Column, Row, Text } from '@expo/ui'
import { Box, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { rotate, semantics, size as sizeModifier } from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import { RING_THICKNESS, type StatusRingProps } from './StatusRing'

// The gap between segments, in degrees.
const GAP = 4

interface Flags {
  sem?: boolean
  num?: boolean
  spacing?: boolean
  big?: boolean
}

/**
 * A ring of coloured segments around a number. Compose has no chart, so each segment is a
 * determinate circular progress indicator covering its share of the ring, turned to its place.
 */
function Ring({
  segments,
  count,
  caption,
  label,
  size = 200,
  flags,
}: StatusRingProps & { flags: Flags }) {
  const colors = useColors()
  const thickness = Math.round(size * RING_THICKNESS)
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  const share = 360 / shown.length
  const gap = shown.length > 1 ? GAP : 0
  return (
    <Box
      contentAlignment="center"
      modifiers={[
        sizeModifier(size, size),
        ...(flags.sem ? [semantics({ contentDescription: label })] : []),
      ]}
    >
      {shown.map((s, i) => (
        <CircularProgressIndicator
          key={s.key}
          progress={(share - gap) / 360}
          color={colors[s.color]}
          trackColor={colors.clear}
          strokeWidth={thickness}
          strokeCap="butt"
          gapSize={0}
          modifiers={[sizeModifier(size, size), rotate(i * share + gap / 2)]}
        />
      ))}
      {flags.num ? (
        <Column alignment="center" {...(flags.spacing ? { spacing: 0 } : {})}>
          <Text
            textStyle={
              flags.big ? { fontSize: 56, fontWeight: '700', color: colors.textPrimary } : {}
            }
          >
            {String(count)}
          </Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
        </Column>
      ) : null}
    </Box>
  )
}

// DEBUG: which part of the ring stops it showing on the emulator.
export function StatusRing(props: StatusRingProps) {
  const small = { ...props, size: 100 }
  return (
    <Column alignment="center" spacing={4}>
      <Row spacing={8}>
        <Column alignment="center">
          <Ring {...small} flags={{}} />
          <Text>V</Text>
        </Column>
        <Column alignment="center">
          <Ring {...small} flags={{}} />
        </Column>
        <Ring {...small} flags={{}} />
      </Row>
      <Text>V column+text · W column · X bare</Text>
      <Column alignment="center">
        <Ring {...props} flags={{ sem: true, num: true, spacing: true, big: true }} />
        <Text> </Text>
      </Column>
    </Column>
  )
}
