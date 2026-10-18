import { parseDateInput, type IsoDate } from '@car/core'
import { Column } from '@expo/ui'
import { useColors } from '../theme'
import { Text } from './Text'

export interface DateFieldProps {
  label: string
  /** The chosen day as an ISO date, or '' while none is chosen. */
  value: string
  /** Called with the ISO date the owner picked. */
  onChange: (date: IsoDate) => void
  error?: string | undefined
  /** The earliest and latest days the picker offers, as ISO dates. */
  min?: IsoDate | undefined
  max?: IsoDate | undefined
  /** What the field says while no day is chosen. */
  placeholder?: string | undefined
}

/**
 * A labelled date field that opens the platform's date picker. The model holds the day as an ISO
 * date; see DateField.ios.tsx and DateField.android.tsx. The web preview uses the browser's own
 * date input, which works in ISO dates too.
 */
export function DateField({ label, value, onChange, error, min, max }: DateFieldProps) {
  const colors = useColors()
  return (
    <Column spacing={4}>
      <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <input
        type="date"
        aria-label={label}
        value={parseDateInput(value) ?? ''}
        min={min}
        max={max}
        onChange={(e) => {
          const date = parseDateInput(e.target.value)
          if (date) onChange(date)
        }}
        style={{
          font: 'inherit',
          fontSize: 16,
          padding: '11px 14px',
          borderRadius: 12,
          border: error ? `1px solid ${colors.danger}` : 'none',
          backgroundColor: colors.neutralSubtle,
          color: colors.textPrimary,
        }}
      />
      {error ? <Text textStyle={{ fontSize: 12, color: colors.danger }}>{error}</Text> : null}
    </Column>
  )
}
