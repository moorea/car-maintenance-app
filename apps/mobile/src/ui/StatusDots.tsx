import { Column, Row } from '@expo/ui'
import { useColors, type ColorRole } from '../theme'
import { Dot } from './surfaces'
import { Text } from './Text'

export interface StatusDotsProps {
  /** One per thing the dots stand for, in order from the left. */
  segments: { key: string; color: ColorRole }[]
  /** The big number. */
  count: number
  /** Under the number, such as "need you". */
  caption: string
  /** What VoiceOver and TalkBack read for the whole thing: the count and what it means. */
  label: string
  /** The widest the row of dots may grow, in points. */
  size?: number
}

const GAP = 6

/**
 * A big number over a row of coloured dots, one per segment. The web preview shows it as is; iOS
 * and Android wrap it so screen readers read the label instead of the parts.
 *
 * A ring around the number was tried first. Swift Charts ignored the donut's inner radius on the
 * simulator and Compose drew its arcs only some of the time, so the dots use the same plain shapes
 * as the status dots elsewhere, which draw reliably on both.
 */
export function StatusDots({ segments, count, caption, size = 240 }: StatusDotsProps) {
  const colors = useColors()
  // With nothing to show, one empty dot keeps the shape.
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  const dot = Math.max(6, Math.min(14, (size - GAP * (shown.length - 1)) / shown.length))
  return (
    <Column alignment="center" spacing={10}>
      <Column alignment="center" spacing={0}>
        <Text textStyle={{ fontSize: 64, fontWeight: '700', color: colors.textPrimary }}>
          {String(count)}
        </Text>
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
      </Column>
      <Row spacing={GAP}>
        {shown.map((s) => (
          <Dot key={s.key} color={s.color} size={dot} />
        ))}
      </Row>
    </Column>
  )
}
