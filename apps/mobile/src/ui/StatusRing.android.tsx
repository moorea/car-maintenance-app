// The number sits inside a ring of fixed size, so it stays a fixed size too, as on iOS.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Column, Row, Text } from '@expo/ui'
import {
  Box,
  CircularProgressIndicator,
  CircularWavyProgressIndicator,
} from '@expo/ui/jetpack-compose'
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
  // DEBUG: which ways of drawing an arc show on the emulator.
  const t = 8
  const debug = (
    <Row spacing={8}>
      <Column alignment="center">
        <CircularProgressIndicator
          progress={0.3}
          color={colors.danger}
          modifiers={[sizeModifier(60, 60)]}
        />
        <Text>B</Text>
      </Column>
      <Column alignment="center">
        <Box modifiers={[sizeModifier(60, 60)]}>
          <CircularProgressIndicator
            progress={0.3}
            color={colors.danger}
            strokeWidth={t}
            modifiers={[sizeModifier(60, 60)]}
          />
        </Box>
        <Text>C</Text>
      </Column>
      <Column alignment="center">
        <CircularProgressIndicator
          progress={0.3}
          color={colors.danger}
          strokeWidth={t}
          modifiers={[sizeModifier(60, 60), rotate(90)]}
        />
        <Text>D</Text>
      </Column>
      <Column alignment="center">
        <CircularProgressIndicator
          progress={0.3}
          color={colors.danger}
          trackColor={colors.clear}
          strokeWidth={t}
          strokeCap="butt"
          gapSize={0}
          modifiers={[sizeModifier(60, 60)]}
        />
        <Text>E</Text>
      </Column>
      <Column alignment="center">
        <CircularWavyProgressIndicator
          progress={0.3}
          color={colors.danger}
          amplitude={0}
          modifiers={[sizeModifier(60, 60)]}
        />
        <Text>F</Text>
      </Column>
      <Column alignment="center">
        <CircularProgressIndicator color={colors.danger} modifiers={[sizeModifier(60, 60)]} />
        <Text>G</Text>
      </Column>
    </Row>
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
