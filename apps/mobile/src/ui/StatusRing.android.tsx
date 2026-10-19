// The number sits inside a ring of fixed size, so it stays a fixed size too, as on iOS.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Column, Row, Text } from '@expo/ui'
import { Box, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { rotate, semantics, size as sizeModifier } from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import { RING_THICKNESS, type StatusRingProps } from './StatusRing'

// The gap between segments, in degrees.
const GAP = 4

/**
 * A ring of coloured segments around a number. Compose has no chart, so each segment is a
 * determinate circular progress indicator covering its share of the ring, turned to its place.
 */
export function StatusRing({ segments, count, caption, label, size = 200 }: StatusRingProps) {
  const colors = useColors()
  const thickness = size * RING_THICKNESS
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  const share = 360 / shown.length
  const gap = shown.length > 1 ? GAP : 0
  // DEBUG: which part of the ring stops it showing on the emulator.
  const arcs = (n: number) =>
    Array.from({ length: n }, (_, i) => (
      <CircularProgressIndicator
        key={i}
        progress={(360 / n - 4) / 360}
        color={i % 2 ? colors.warning : colors.accent}
        trackColor={colors.clear}
        strokeWidth={8}
        strokeCap="butt"
        gapSize={0}
        modifiers={[sizeModifier(70, 70), rotate((i * 360) / n + 2)]}
      />
    ))
  const debug = (
    <Column alignment="center">
      <Row spacing={8}>
        <Column alignment="center">
          <Box contentAlignment="center" modifiers={[sizeModifier(70, 70)]}>
            {arcs(3)}
          </Box>
          <Text>H</Text>
        </Column>
        <Column alignment="center">
          <Box
            contentAlignment="center"
            modifiers={[sizeModifier(70, 70), semantics({ contentDescription: 'x' })]}
          >
            {arcs(3)}
          </Box>
          <Text>I</Text>
        </Column>
        <Column alignment="center">
          <Box contentAlignment="center" modifiers={[sizeModifier(70, 70)]}>
            {arcs(3)}
            <Column alignment="center">
              <Text>6</Text>
            </Column>
          </Box>
          <Text>J</Text>
        </Column>
        <Column alignment="center">
          <Box contentAlignment="center" modifiers={[sizeModifier(70, 70)]}>
            {arcs(25)}
          </Box>
          <Text>K</Text>
        </Column>
      </Row>
      <Text>{`n=${shown.length} p=${((share - gap) / 360).toFixed(3)} c=${String(colors[shown[0]?.color ?? 'separator'])} k=${shown
        .slice(0, 3)
        .map((s) => s.key)
        .join(',')}`}</Text>
    </Column>
  )
  return (
    <Column alignment="center">
      {debug}
      <Box
        contentAlignment="center"
        modifiers={[sizeModifier(size, size), semantics({ contentDescription: label })]}
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
        <Column alignment="center" spacing={0}>
          <Text textStyle={{ fontSize: 56, fontWeight: '700', color: colors.textPrimary }}>
            {String(count)}
          </Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
        </Column>
      </Box>
    </Column>
  )
}
