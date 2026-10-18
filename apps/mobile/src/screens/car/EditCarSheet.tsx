import type { EditCarActions, EditCarState } from '@car/core'
import { BottomSheet, Button, Column, Row, ScrollView, Spacer } from '@expo/ui'
import { useColors } from '../../theme'
import { ErrorText, Note } from '../../ui/Note'
import { Text } from '../../ui/Text'
import { TextField } from '../../ui/TextField'
import { PillButton } from '../../ui/surfaces'

type Props = EditCarState & Pick<EditCarActions, 'setNickname' | 'close' | 'save' | 'remove'>

/** The sheet for renaming a car, or removing it from the garage. */
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

function EditCarForm({ title, form, setNickname, close, save, remove }: Props) {
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
