import { Column, Row, Spacer } from '@expo/ui'
import {
  FilledIconButton as ComposeFilledIconButton,
  HorizontalDivider,
  IconButton,
  LinearProgressIndicator,
} from '@expo/ui/jetpack-compose'
import {
  background,
  clickable,
  clip,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  selectable,
  semantics,
  Shapes,
  size as sizeModifier,
  weight,
  type ModifierConfig,
} from '@expo/ui/jetpack-compose/modifiers'
import type { ReactNode } from 'react'
import { useColors, type ColorRole } from '../theme'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'
import { Text } from './Text'

// Android has no Liquid Glass, so glass surfaces are the translucent `glass` fill, without an edge
// line since Compose's border is always square. Compose takes no percentage sizes or flex, so
// filling space uses `fillMaxWidth` (in a column) and `weight` (for a share of a row) instead.

const capsule = Shapes.RoundedCorner(999)

// The order matters in Compose: the shape clips the fill and the ripple, and a tap anywhere in
// the padded area counts.
const filled = (color: string, radius: number, onPress?: () => void): ModifierConfig[] => [
  clip(Shapes.RoundedCorner(radius)),
  background(color),
  ...(onPress ? [clickable(onPress)] : []),
]

const glass = (colors: ReturnType<typeof useColors>, shape = capsule): ModifierConfig[] => [
  clip(shape),
  background(colors.glass),
]

interface CardProps {
  children: ReactNode
  /** The card's fill. Defaults to `surface`. */
  fill?: ColorRole
  padding?: number
  spacing?: number
  onPress?: () => void
}

/** A rounded card that fills the width of its column. */
export function Card({ children, fill = 'surface', padding = 16, spacing, onPress }: CardProps) {
  const colors = useColors()
  return (
    <Column
      spacing={spacing ?? 0}
      modifiers={[fillMaxWidth(), ...filled(colors[fill], 24, onPress), paddingAll(padding)]}
    >
      {children}
    </Column>
  )
}

/** A floating capsule holding a row of controls, such as the tab bar. Takes the row's spare width. */
export function GlassBar({ children }: { children: ReactNode }) {
  const colors = useColors()
  return (
    <Row alignment="center" modifiers={[weight(1), ...glass(colors), paddingAll(4)]}>
      {children}
    </Row>
  )
}

interface GlassButtonProps {
  symbol: SymbolName
  /** What TalkBack reads for the button, such as "Add car". */
  label: string
  onPress: () => void
  /** Icon colour. Defaults to `textPrimary`. */
  tint?: ColorRole
  size?: number
}

/** A round glass button showing one icon, for toolbars over content. */
export function GlassIconButton({
  symbol,
  label,
  onPress,
  tint = 'textPrimary',
  size = 44,
}: GlassButtonProps) {
  const colors = useColors()
  return (
    <IconButton
      onClick={onPress}
      colors={{ containerColor: colors.glass, contentColor: colors[tint] }}
      modifiers={[
        sizeModifier(size, size),
        clip(Shapes.Circle),
        semantics({ contentDescription: label }),
      ]}
    >
      <Symbol name={symbol} size={size * 0.46} color={colors[tint]} />
    </IconButton>
  )
}

/** A thin bar showing how far along something is, from 0 to 1. */
export function ProgressBar({
  value,
  fill,
  track,
}: {
  value: number
  fill: ColorRole
  track: ColorRole
}) {
  const colors = useColors()
  return (
    <LinearProgressIndicator
      progress={Math.min(1, Math.max(0, value))}
      color={colors[fill]}
      trackColor={colors[track]}
      modifiers={[fillMaxWidth(), height(6)]}
    />
  )
}

interface SegmentProps {
  children: ReactNode
  /** What TalkBack reads for the choice; the visible label inside already says it. */
  label: string
  selected: boolean
  onPress: () => void
}

/** One of several equal-width choices in a row, such as a tab. The selected one is filled. */
export function Segment({ children, selected, onPress }: SegmentProps) {
  const colors = useColors()
  return (
    <Column
      alignment="center"
      spacing={1}
      modifiers={[
        weight(1),
        clip(capsule),
        ...(selected ? [background(colors.selectedFill)] : []),
        selectable(selected, onPress, 'tab'),
        padding(4, 6, 4, 6),
      ]}
    >
      {children}
    </Column>
  )
}

interface PillButtonProps {
  label: string
  onPress: () => void
  fill: ColorRole
  text: ColorRole
}

/** A capsule button that shares its row's width equally with its siblings. */
export function PillButton({ label, onPress, fill, text }: PillButtonProps) {
  const colors = useColors()
  return (
    <Row
      alignment="center"
      modifiers={[weight(1), height(44), ...filled(colors[fill], 22, onPress)]}
    >
      <Spacer flexible />
      <Text textStyle={{ fontSize: 16, fontWeight: '600', color: colors[text] }}>{label}</Text>
      <Spacer flexible />
    </Row>
  )
}

/** A hairline between rows in a card, inset from the leading edge. */
export function Separator({ inset = 16 }: { inset?: number }) {
  const colors = useColors()
  return (
    <HorizontalDivider
      thickness={0.5}
      color={colors.separator}
      modifiers={[padding(inset, 0, 0, 0)]}
    />
  )
}

/** A column that takes the row's leftover width, so long text wraps instead of overflowing. */
export function FillColumn({ children, spacing }: { children: ReactNode; spacing?: number }) {
  return (
    <Column spacing={spacing ?? 0} modifiers={[weight(1)]}>
      {children}
    </Column>
  )
}

interface FillRowProps {
  children: ReactNode
  spacing?: number
  onPress?: () => void
}

/** A row that takes its parent row's leftover width, tappable across all of it. */
export function FillRow({ children, spacing, onPress }: FillRowProps) {
  return (
    <Row
      alignment="center"
      spacing={spacing ?? 0}
      modifiers={[weight(1), ...(onPress ? [clickable(onPress)] : [])]}
    >
      {children}
    </Row>
  )
}

interface DotProps {
  color: ColorRole
  /** What the colour means, such as "Overdue", for TalkBack. Without it the dot is skipped. */
  label?: string
  size?: number
}

/** A small filled circle, such as a status dot beside a row. */
export function Dot({ color, label, size = 10 }: DotProps) {
  const colors = useColors()
  return (
    <Row
      modifiers={[
        sizeModifier(size, size),
        clip(Shapes.Circle),
        background(colors[color]),
        ...(label ? [semantics({ contentDescription: label })] : []),
      ]}
    />
  )
}

/** A chat bubble that hugs its text. Place it in a row with a spacer to push it to one side. */
export function Bubble({ children, fill }: { children: ReactNode; fill: ColorRole }) {
  const colors = useColors()
  return (
    <Column
      spacing={10}
      alignment="start"
      modifiers={[...filled(colors[fill], 20), padding(14, 10, 14, 10)]}
    >
      {children}
    </Column>
  )
}

/** A small label in a capsule, such as a source an answer cites. */
export function Chip({ label, symbol }: { label: string; symbol: SymbolName }) {
  const colors = useColors()
  return (
    <Row
      spacing={4}
      alignment="center"
      modifiers={[...filled(colors.neutralSubtle, 12), padding(10, 4, 10, 4)]}
    >
      <Symbol name={symbol} size={12} color={colors.textSecondary} />
      <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text>
    </Row>
  )
}

/** A glass capsule button with a short label, such as a suggested question. */
export function GlassPill({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors()
  return (
    <Row
      alignment="center"
      modifiers={[height(36), ...glass(colors), clickable(onPress), padding(14, 0, 14, 0)]}
    >
      <Text textStyle={{ fontSize: 14, color: colors.textPrimary }}>{label}</Text>
    </Row>
  )
}

interface FilledIconButtonProps {
  symbol: SymbolName
  /** What TalkBack reads for the button, such as "Send". */
  label: string
  onPress: () => void
  disabled?: boolean
  size?: number
}

/** A round button filled with the accent, for the one main action, such as sending. */
export function FilledIconButton({
  symbol,
  label,
  onPress,
  disabled,
  size = 44,
}: FilledIconButtonProps) {
  const colors = useColors()
  return (
    <ComposeFilledIconButton
      onClick={onPress}
      enabled={!disabled}
      colors={{
        containerColor: colors.accent,
        contentColor: colors.onAccent,
        disabledContainerColor: colors.accentSubtle,
        disabledContentColor: colors.accent,
      }}
      modifiers={[sizeModifier(size, size), semantics({ contentDescription: label })]}
    >
      <Symbol name={symbol} size={size * 0.42} color={colors.onAccent} />
    </ComposeFilledIconButton>
  )
}

/** A padded row inside a card that responds to a tap across its whole width. */
export function TappableRow({
  children,
  onPress,
  spacing,
}: {
  children: ReactNode
  onPress: () => void
  spacing?: number
}) {
  return (
    <Column
      spacing={spacing ?? 0}
      alignment="start"
      modifiers={[fillMaxWidth(), clickable(onPress), padding(16, 12, 16, 12)]}
    >
      {children}
    </Column>
  )
}
