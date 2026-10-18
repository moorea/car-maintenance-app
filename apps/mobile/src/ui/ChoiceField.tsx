import { Picker } from '@expo/ui'

export interface ChoiceFieldProps {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

/** A field that picks one of a few options, such as what a service was. The platform's picker. */
export function ChoiceField({ value, options, onChange }: ChoiceFieldProps) {
  return (
    <Picker selectedValue={value} onValueChange={(v) => onChange(String(v))}>
      {options.map((o) => (
        <Picker.Item key={o.value} label={o.label} value={o.value} />
      ))}
    </Picker>
  )
}
