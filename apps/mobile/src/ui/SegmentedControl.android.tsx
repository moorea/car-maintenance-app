import { SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import type { SegmentedControlProps } from './SegmentedControl'

/** Material's segmented buttons, Android's counterpart to iOS's segmented control. */
export function SegmentedControl<K extends string>({
  options,
  selected,
  onSelect,
}: SegmentedControlProps<K>) {
  const colors = useColors()
  return (
    <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
      {options.map((o) => (
        <SegmentedButton
          key={o.value}
          selected={o.value === selected}
          onClick={() => onSelect(o.value)}
          colors={{
            activeContainerColor: colors.accentSubtle,
            activeContentColor: colors.accent,
            activeBorderColor: colors.separator,
            inactiveContainerColor: colors.surface,
            inactiveContentColor: colors.textPrimary,
            inactiveBorderColor: colors.separator,
          }}
        >
          <SegmentedButton.Label>
            <Text>{o.label}</Text>
          </SegmentedButton.Label>
        </SegmentedButton>
      ))}
    </SingleChoiceSegmentedButtonRow>
  )
}
