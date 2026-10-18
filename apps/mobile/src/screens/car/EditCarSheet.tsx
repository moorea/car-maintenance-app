import {
  BODY_STYLES,
  DEFAULT_BODY_STYLE,
  DEFAULT_PAINT,
  PAINTS,
  type EditCarActions,
  type EditCarState,
  type Paint,
} from '@car/core'
import { BottomSheet, Column, Row, ScrollView, Spacer } from '@expo/ui'
import { paintColors, useColors } from '../../theme'
import { Button } from '../../ui/Button'
import { ErrorText, Note } from '../../ui/Note'
import { Text } from '../../ui/Text'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { PillButton } from '../../ui/surfaces'

type Props = EditCarState &
  Pick<EditCarActions, 'setNickname' | 'setBodyStyle' | 'setPaint' | 'close' | 'save' | 'remove'>

/** The sheet for renaming a car, choosing how the app draws it, or removing it from the garage. */
export function EditCarSheet(props: Props) {
  return (
    <BottomSheet
      isPresented={props.form !== undefined}
      onDismiss={props.close}
      snapPoints={['full']}
      contentPadding={0}
    >
      <EditCarForm {...props} />
    </BottomSheet>
  )
}

function EditCarForm({
  title,
  form,
  setNickname,
  setBodyStyle,
  setPaint,
  close,
  save,
  remove,
}: Props) {
  const colors = useColors()
  if (!form) return null
  const busy = form.saving || form.removing
  return (
    <ScrollView>
      <Column spacing={12} style={{ padding: 16 }}>
        <Row alignment="center">
          <Button variant="text" label="Cancel" disabled={busy} onPress={close} />
          <Spacer flexible />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Edit car</Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={form.saving ? 'Saving…' : 'Save'}
            disabled={busy}
            onPress={() => void save()}
          />
        </Row>
        <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>{title}</Text>
        <TextField
          label="Name"
          value={form.nickname}
          onChangeText={setNickname}
          error={form.nicknameError}
          placeholder="What you call it, like Daily or Mom’s car"
          autoCapitalize="words"
        />
        <Note>The garage and reminders use this name.</Note>
        <Column spacing={8} style={{ paddingTop: 8 }}>
          <Text textStyle={{ fontSize: 15, fontWeight: '600' }}>Body</Text>
          <SegmentedControl
            options={BODY_STYLES.map((b) => ({ value: b.id, label: b.label }))}
            // Unset draws the default, so that is what shows as picked.
            selected={form.bodyStyle ?? DEFAULT_BODY_STYLE}
            onSelect={setBodyStyle}
          />
        </Column>
        <Column spacing={8} style={{ paddingTop: 8 }}>
          <Text textStyle={{ fontSize: 15, fontWeight: '600' }}>Paint</Text>
          <PaintPicker selected={form.paint ?? DEFAULT_PAINT} onSelect={setPaint} />
        </Column>
        <Note>How the app draws your car.</Note>
        {form.error ? <ErrorText>{form.error}</ErrorText> : null}
        <Column spacing={6} style={{ paddingTop: 16 }}>
          <Row>
            <PillButton
              label={
                form.removing
                  ? 'Removing…'
                  : form.confirmingRemove
                    ? 'Tap again to remove'
                    : 'Remove car'
              }
              onPress={() => void remove()}
              fill={form.confirmingRemove ? 'danger' : 'neutralSubtle'}
              text={form.confirmingRemove ? 'onDanger' : 'danger'}
            />
          </Row>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
            {form.confirmingRemove
              ? 'This deletes its service history, documents, fill-ups, warranties and renewal dates from all your phones, and stops its reminders. It can’t be undone. To keep a copy, export your data from Account first.'
              : 'For a car you sold or no longer drive.'}
          </Text>
        </Column>
      </Column>
    </ScrollView>
  )
}

/** A swatch for each paint, named under it so it reads and taps by name. */
function PaintPicker({ selected, onSelect }: { selected: Paint; onSelect: (p: Paint) => void }) {
  const colors = useColors()
  return (
    <Row alignment="start">
      {PAINTS.map((paint, i) => {
        const isSelected = paint.id === selected
        return [
          i > 0 ? <Spacer key={`gap-${paint.id}`} flexible /> : null,
          <Column
            key={paint.id}
            spacing={4}
            alignment="center"
            onPress={() => onSelect(paint.id)}
            testID={`paint-${paint.id}`}
            style={{ width: 40 }}
          >
            <Column
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                padding: 3,
                borderWidth: 2,
                borderColor: isSelected ? colors.accent : colors.clear,
              }}
            >
              <Column
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: colors.separator,
                  backgroundColor: paintColors[paint.id],
                }}
              />
            </Column>
            <Text
              textStyle={{
                fontSize: 11,
                fontWeight: isSelected ? '600' : '400',
                color: isSelected ? colors.textPrimary : colors.textSecondary,
              }}
            >
              {paint.label}
            </Text>
          </Column>,
        ]
      })}
    </Row>
  )
}
