import { Picker, Text } from '@expo/ui/swift-ui'
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers'
import type { SegmentedControlProps } from './SegmentedControl'

/** iOS's native segmented control. */
export function SegmentedControl<K extends string>({
  options,
  selected,
  onSelect,
}: SegmentedControlProps<K>) {
  return (
    <Picker<K>
      selection={selected}
      onSelectionChange={onSelect}
      modifiers={[pickerStyle('segmented')]}
    >
      {options.map((o) => (
        <Text key={o.value} modifiers={[tag(o.value)]}>
          {o.label}
        </Text>
      ))}
    </Picker>
  )
}
