import { Column, Row } from '@expo/ui'
import { Divider, ProgressView } from '@expo/ui/swift-ui'
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  background,
  buttonBorderShape,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  frame,
  glassEffect,
  onTapGesture,
  opacity,
  padding as paddingModifier,
  shapes,
  tint as tintModifier,
} from '@expo/ui/swift-ui/modifiers'
import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { useColors, type ColorRole } from '../theme'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'
import { Text } from './Text'
import { Button } from './Button'

// Liquid Glass arrived in iOS 26. Before that, glass modifiers do nothing, so fall back to the
// system material and a bordered button.
const hasGlass = Number.parseInt(String(Platform.Version), 10) >= 26

/** How faint a disabled pill is, as system buttons fade while they can't be pressed. */
const DISABLED_OPACITY = 0.4

// Universal `onPress` adds its tap gesture inside the custom modifiers, so only the bare content
// would respond. Appending it after the fill makes the whole padded shape tappable.
// A tap gesture alone is invisible to VoiceOver, so the shape also becomes one element that reads
// its contents and is announced as a button.
const tappable = (onPress: (() => void) | undefined) =>
  onPress
    ? [
        contentShape(shapes.rectangle()),
        onTapGesture(onPress),
        accessibilityElement('combine'),
        accessibilityAddTraits(['isButton']),
      ]
    : []

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
      // The frame stretches the card before the fill is painted, so the fill spans the width.
      modifiers={[
        paddingModifier({ all: padding }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        background(colors[fill], shapes.roundedRectangle({ cornerRadius: 24 })),
        ...tappable(onPress),
      ]}
    >
      {children}
    </Column>
  )
}

/** A floating capsule of native Liquid Glass holding a row of controls, such as the tab bar. */
export function GlassBar({ children }: { children: ReactNode }) {
  return (
    <Row
      alignment="center"
      modifiers={[
        paddingModifier({ all: 4 }),
        hasGlass
          ? glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })
          : background({ type: 'material', material: 'regular' }, shapes.capsule()),
      ]}
    >
      {children}
    </Row>
  )
}

interface GlassButtonProps {
  symbol: SymbolName
  /** What VoiceOver reads for the button, such as "Add car". */
  label: string
  onPress: () => void
  /** Icon colour. Defaults to `textPrimary`. */
  tint?: ColorRole
  size?: number
}

/** A round Liquid Glass button showing one icon, for toolbars over content. */
export function GlassIconButton({
  symbol,
  label,
  onPress,
  tint = 'textPrimary',
  size = 44,
}: GlassButtonProps) {
  const colors = useColors()
  return (
    <Button
      onPress={onPress}
      modifiers={[
        buttonStyle(hasGlass ? 'glass' : 'bordered'),
        buttonBorderShape('circle'),
        accessibilityLabel(label),
      ]}
    >
      {/* The label sets the button's size; the glass style adds its own margin around it. */}
      <Column alignment="center" modifiers={[frame({ width: size - 16, height: size - 16 })]}>
        <Symbol name={symbol} size={size * 0.46} color={colors[tint]} />
      </Column>
    </Button>
  )
}

/** A thin bar showing how far along something is, from 0 to 1. */
export function ProgressBar({ value, fill }: { value: number; fill: ColorRole; track: ColorRole }) {
  const colors = useColors()
  return (
    <ProgressView
      value={Math.min(1, Math.max(0, value))}
      modifiers={[tintModifier(colors[fill])]}
    />
  )
}

interface SegmentProps {
  children: ReactNode
  /** What VoiceOver reads for the choice. */
  label: string
  selected: boolean
  onPress: () => void
}

/** One of several equal-width choices in a row, such as a tab. The selected one is filled. */
export function Segment({ children, label, selected, onPress }: SegmentProps) {
  const colors = useColors()
  return (
    <Column
      alignment="center"
      spacing={1}
      modifiers={[
        paddingModifier({ vertical: 6, horizontal: 4 }),
        frame({ maxWidth: Infinity }),
        ...(selected ? [background(colors.selectedFill, shapes.capsule())] : []),
        contentShape(shapes.rectangle()),
        onTapGesture(onPress),
        accessibilityElement('ignore'),
        accessibilityLabel(label),
        accessibilityAddTraits(selected ? ['isButton', 'isSelected'] : ['isButton']),
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
  /** Dims the button and ignores taps, as while the action it starts is still running. */
  disabled?: boolean
}

/** A capsule button that shares its row's width equally with its siblings. */
export function PillButton({ label, onPress, fill, text, disabled = false }: PillButtonProps) {
  const colors = useColors()
  return (
    <Row
      alignment="center"
      modifiers={[
        // At least 44pt tall, and taller when Dynamic Type enlarges the label.
        frame({ minHeight: 44 }),
        frame({ maxWidth: Infinity }),
        background(colors[fill], shapes.capsule()),
        ...tappable(onPress),
        // Disabled turns the tap off and has VoiceOver read the pill as a dimmed button.
        ...(disabled ? [disabledModifier(true), opacity(DISABLED_OPACITY)] : []),
      ]}
    >
      <Text textStyle={{ fontSize: 16, fontWeight: '600', color: colors[text] }}>{label}</Text>
    </Row>
  )
}

/** A hairline between rows in a card, inset from the leading edge. */
export function Separator({ inset = 16 }: { inset?: number }) {
  return <Divider modifiers={[paddingModifier({ leading: inset })]} />
}

/** A column that takes the row's leftover width, so long text wraps instead of overflowing. */
export function FillColumn({ children, spacing }: { children: ReactNode; spacing?: number }) {
  return (
    <Column
      spacing={spacing ?? 0}
      modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
    >
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
      modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), ...tappable(onPress)]}
    >
      {children}
    </Row>
  )
}

interface DotProps {
  color: ColorRole
  /** What the colour means, such as "Overdue", for VoiceOver. Without it the dot is skipped. */
  label?: string
  size?: number
}

/** A small filled circle, such as a status dot beside a row. */
export function Dot({ color, label, size = 10 }: DotProps) {
  const colors = useColors()
  return (
    <Row
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[color] }}
      // An empty shape is not an accessibility element until it is made one.
      modifiers={
        label
          ? [accessibilityElement('ignore'), accessibilityLabel(label)]
          : [accessibilityHidden()]
      }
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
      modifiers={[
        paddingModifier({ horizontal: 14, vertical: 10 }),
        background(colors[fill], shapes.roundedRectangle({ cornerRadius: 20 })),
      ]}
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
      modifiers={[
        paddingModifier({ horizontal: 10, vertical: 4 }),
        background(colors.neutralSubtle, shapes.capsule()),
      ]}
    >
      <Symbol name={symbol} size={12} color={colors.textSecondary} />
      <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text>
    </Row>
  )
}

/** A Liquid Glass capsule button with a short label, such as a suggested question. */
export function GlassPill({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors()
  return (
    <Button
      onPress={onPress}
      modifiers={[buttonStyle(hasGlass ? 'glass' : 'bordered'), buttonBorderShape('capsule')]}
    >
      <Text textStyle={{ fontSize: 14, color: colors.textPrimary }}>{label}</Text>
    </Button>
  )
}

interface FilledIconButtonProps {
  symbol: SymbolName
  /** What VoiceOver reads for the button, such as "Send". */
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
    <Button
      onPress={onPress}
      disabled={disabled ?? false}
      modifiers={[
        buttonStyle(hasGlass ? 'glassProminent' : 'borderedProminent'),
        buttonBorderShape('circle'),
        tintModifier(colors.accent),
        accessibilityLabel(label),
      ]}
    >
      <Column alignment="center" modifiers={[frame({ width: size - 16, height: size - 16 })]}>
        <Symbol name={symbol} size={size * 0.42} color={colors.onAccent} />
      </Column>
    </Button>
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
      modifiers={[
        paddingModifier({ horizontal: 16, vertical: 12 }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        ...tappable(onPress),
      ]}
    >
      {children}
    </Column>
  )
}
