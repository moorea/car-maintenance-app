import { Row, Text, type UniversalStyle } from '@expo/ui'
import { useColors } from '../theme'

export interface SegmentedControlProps<K extends string> {
  options: { value: K; label: string }[]
  selected: K
  onSelect: (value: K) => void
}

/** A row of mutually exclusive choices with the selected one raised, like iOS's segmented control. */
export function SegmentedControl<K extends string>({
  options,
  selected,
  onSelect,
}: SegmentedControlProps<K>) {
  const colors = useColors()
  return (
    <Row style={{ padding: 3, borderRadius: 20, backgroundColor: colors.neutralSubtle }}>
      {options.map((o) => {
        const isSelected = o.value === selected
        return (
          <Row
            key={o.value}
            alignment="center"
            onPress={() => onSelect(o.value)}
            style={{
              ...({
                flex: 1,
                justifyContent: 'center',
                cursor: 'pointer',
                ...(isSelected ? { boxShadow: `0 2px 8px ${colors.glassShadow}` } : {}),
              } as UniversalStyle),
              height: 34,
              borderRadius: 17,
              ...(isSelected ? { backgroundColor: colors.surface } : {}),
            }}
          >
            <Text textStyle={{ fontSize: 14, fontWeight: isSelected ? '600' : '500' }}>
              {o.label}
            </Text>
          </Row>
        )
      })}
    </Row>
  )
}
