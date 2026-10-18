import {
  formatShortDate,
  isoFromLocalDate,
  localNoonOf,
  parseDateInput,
  type IsoDate,
} from '@car/core'
import { Column, Row, Spacer } from '@expo/ui'
import { useState } from 'react'
import { DatePicker } from '@expo/ui/swift-ui'
import {
  accessibilityAddTraits,
  accessibilityLabel,
  datePickerStyle,
} from '@expo/ui/swift-ui/modifiers'
import { useColors } from '../theme'
import { Button } from './Button'
import type { DateFieldProps } from './DateField'
import { fullWidth } from './fullWidth'
import { Symbol } from './Symbol'
import { Text } from './Text'

/** The first and last moments of `date` in the device's time zone. */
const startOfDay = (date: IsoDate) => {
  const d = localNoonOf(date)
  d.setHours(0, 0, 0, 0)
  return d
}
const endOfDay = (date: IsoDate) => {
  const d = localNoonOf(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * iOS's compact date picker: the chosen day in a capsule that opens the calendar. SwiftUI's
 * picker always holds a day, so while none is chosen the field offers to choose one instead: a tap
 * opens the calendar on today (or the nearest day it allows), and nothing is set until a day is
 * picked there or the owner takes today.
 *
 * The picker works in moments in the device's time zone. It gets noon on the chosen day, so no
 * offset or daylight saving change can move it to another day, and reports back the local day.
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
  const [choosing, setChoosing] = useState(false)
  const date = parseDateInput(value)
  const clamp = (day: IsoDate) =>
    max !== undefined && day > max ? max : min !== undefined && day < min ? min : day
  const range =
    min !== undefined || max !== undefined
      ? {
          range: {
            ...(min !== undefined && { start: startOfDay(min) }),
            ...(max !== undefined && { end: endOfDay(max) }),
          },
        }
      : {}
  const empty = placeholder ?? 'Choose a date'
  const today = isoFromLocalDate(new Date())
  // Where the calendar opens, and the day the quick button takes: today, unless it is out of range.
  const nearest = clamp(today)
  return (
    <Column spacing={4}>
      <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {date !== undefined ? (
        <Row alignment="center">
          <DatePicker
            selection={localNoonOf(date)}
            displayedComponents={['date']}
            {...range}
            onDateChange={(picked) => {
              const day = clamp(isoFromLocalDate(picked))
              if (day !== date) onChange(day)
            }}
            modifiers={[datePickerStyle('compact'), accessibilityLabel(label)]}
          />
          <Spacer flexible />
        </Row>
      ) : (
        <>
          <Row
            alignment="center"
            onPress={() => setChoosing((open) => !open)}
            style={{
              ...fullWidth.style,
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: colors.neutralSubtle,
              ...(error ? { borderWidth: 1, borderColor: colors.danger } : {}),
            }}
            modifiers={[
              accessibilityLabel(`${label}, ${empty}`),
              accessibilityAddTraits(['isButton']),
            ]}
          >
            <Text textStyle={{ fontSize: 16, color: colors.textSecondary }}>{empty}</Text>
            <Spacer flexible />
            <Symbol name="calendar" size={20} color={colors.textSecondary} />
          </Row>
          {choosing ? (
            <>
              <DatePicker
                selection={localNoonOf(nearest)}
                displayedComponents={['date']}
                {...range}
                onDateChange={(picked) => {
                  setChoosing(false)
                  onChange(clamp(isoFromLocalDate(picked)))
                }}
                modifiers={[datePickerStyle('graphical'), accessibilityLabel(label)]}
              />
              <Row alignment="center">
                <Button
                  variant="text"
                  label={nearest === today ? 'Use today' : `Use ${formatShortDate(nearest, today)}`}
                  onPress={() => {
                    setChoosing(false)
                    onChange(nearest)
                  }}
                />
                <Spacer flexible />
              </Row>
            </>
          ) : null}
        </>
      )}
      {error ? <Text textStyle={{ fontSize: 12, color: colors.danger }}>{error}</Text> : null}
    </Column>
  )
}
