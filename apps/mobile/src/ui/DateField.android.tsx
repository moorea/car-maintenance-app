import {
  formatLongDate,
  isoFromUtcDate,
  localNoonOf,
  parseDateInput,
  utcMidnightOf,
} from '@car/core'
import { Column, Row, Spacer } from '@expo/ui'
import { DatePickerDialog } from '@expo/ui/jetpack-compose'
import {
  background,
  clickable,
  clip,
  fillMaxWidth,
  padding,
  semantics,
  Shapes,
} from '@expo/ui/jetpack-compose/modifiers'
import { useState } from 'react'
import { useColors } from '../theme'
import type { DateFieldProps } from './DateField'
import { Symbol } from './Symbol'
import { Text } from './Text'

/**
 * A field drawn like the app's text fields, showing the chosen day ("Mar 14, 2025"), that opens
 * Material's date picker dialog. With no day chosen the dialog opens on this month with nothing
 * selected, and OK stays disabled until the owner picks one.
 *
 * Material works in days as midnight UTC, which is how the field sends and reads them. Its bounds
 * are read by their local calendar day, so they go as local noon.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  min,
  max,
  placeholder,
}: DateFieldProps) {
  const colors = useColors()
  // Purely visual: whether the dialog is open (ADR 0003 allows it here).
  const [open, setOpen] = useState(false)
  const date = parseDateInput(value)
  const shown = date !== undefined ? formatLongDate(date) : (placeholder ?? 'Choose a date')
  return (
    <Column spacing={4}>
      <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Row
        alignment="center"
        modifiers={[
          fillMaxWidth(),
          clip(Shapes.RoundedCorner(12)),
          background(colors.neutralSubtle),
          clickable(() => setOpen(true)),
          semantics({ contentDescription: `${label}, ${shown}` }),
          padding(14, 11, 10, 11),
        ]}
      >
        <Text
          textStyle={{
            fontSize: 16,
            color: date !== undefined ? colors.textPrimary : colors.textSecondary,
          }}
        >
          {shown}
        </Text>
        <Spacer flexible />
        <Symbol name="calendar" size={22} color={error ? colors.danger : colors.textSecondary} />
      </Row>
      {error ? <Text textStyle={{ fontSize: 12, color: colors.danger }}>{error}</Text> : null}
      {open ? (
        <DatePickerDialog
          initialDate={date !== undefined ? utcMidnightOf(date).toISOString() : null}
          {...(min !== undefined || max !== undefined
            ? {
                selectableDates: {
                  ...(min !== undefined && { start: localNoonOf(min) }),
                  ...(max !== undefined && { end: localNoonOf(max) }),
                },
              }
            : {})}
          onDateSelected={(picked) => {
            setOpen(false)
            onChange(isoFromUtcDate(picked))
          }}
          onDismissRequest={() => setOpen(false)}
        />
      ) : null}
    </Column>
  )
}
