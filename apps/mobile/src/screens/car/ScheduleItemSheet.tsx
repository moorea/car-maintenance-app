import type { ScheduleItemActions, ScheduleItemState } from '@car/core'
import { BottomSheet, Button, Column, Row, ScrollView, Spacer } from '@expo/ui'
import { useColors } from '../../theme'
import { ErrorText, Note } from '../../ui/Note'
import { Text } from '../../ui/Text'
import { TextField } from '../../ui/TextField'
import { PillButton } from '../../ui/surfaces'

type Props = ScheduleItemState &
  Pick<ScheduleItemActions, 'setField' | 'close' | 'save' | 'reset' | 'remove'>

const TITLE = { add: 'Add an item', own: 'Edit item', change: 'Your interval' } as const

/** The sheet for adding an item to a car's schedule, or setting the owner's own interval. */
export function ScheduleItemSheet(props: Props) {
  return (
    <BottomSheet
      isPresented={props.form !== undefined}
      onDismiss={props.close}
      snapPoints={['full']}
      contentPadding={0}
    >
      <ScheduleItemForm {...props} />
    </BottomSheet>
  )
}

function ScheduleItemForm({ form, setField, close, save, reset, remove }: Props) {
  const colors = useColors()
  if (!form) return null
  const { draft, fieldErrors: errors, saving } = form
  return (
    <ScrollView>
      <Column spacing={12} style={{ padding: 16 }}>
        <Row alignment="center">
          <Button variant="text" label="Cancel" disabled={saving} onPress={close} />
          <Spacer flexible />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{TITLE[form.mode]}</Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={saving ? 'Saving…' : 'Save'}
            disabled={saving}
            onPress={() => void save()}
          />
        </Row>
        {form.mode === 'change' ? (
          <Column spacing={4}>
            <Text textStyle={{ fontSize: 22, fontWeight: '700' }}>{draft.task}</Text>
            {form.scheduleInterval ? <Note>{`${form.scheduleInterval}.`}</Note> : null}
          </Column>
        ) : (
          <TextField
            label="Item"
            value={draft.task}
            onChangeText={(v) => setField('task', v)}
            error={errors.task}
            placeholder="Cabin air filter, wiper blades, timing belt"
            autoCapitalize="sentences"
          />
        )}
        <TextField
          label="Every (miles)"
          value={draft.intervalMiles}
          onChangeText={(v) => setField('intervalMiles', v)}
          error={errors.intervalMiles}
          placeholder="Leave blank if it goes by time only"
          keyboardType="number-pad"
        />
        <TextField
          label="Or every (months)"
          value={draft.intervalMonths}
          onChangeText={(v) => setField('intervalMonths', v)}
          error={errors.intervalMonths}
          placeholder="Leave blank if it goes by miles only"
          keyboardType="number-pad"
        />
        <Note>
          {form.mode === 'change'
            ? 'Your interval is used for reminders whichever way you drive. Whichever limit comes first makes it due.'
            : 'Whichever limit comes first makes it due, and reminders follow it like the rest of the schedule.'}
        </Note>
        {form.error ? <ErrorText>{form.error}</ErrorText> : null}
        {form.canReset ? (
          <Row style={{ paddingTop: 8 }}>
            <PillButton
              label="Use the schedule’s interval"
              onPress={() => void reset()}
              fill="neutralSubtle"
              text="accent"
            />
          </Row>
        ) : null}
        {form.mode === 'own' ? (
          <Column spacing={6} style={{ paddingTop: 8 }}>
            <Row>
              <PillButton
                label={form.confirmingDelete ? 'Tap again to delete' : 'Delete item'}
                onPress={() => void remove()}
                fill={form.confirmingDelete ? 'danger' : 'neutralSubtle'}
                text={form.confirmingDelete ? 'onDanger' : 'danger'}
              />
            </Row>
            {form.confirmingDelete ? (
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
                Its reminders stop. Services you logged for it stay in the log.
              </Text>
            ) : null}
          </Column>
        ) : null}
      </Column>
    </ScrollView>
  )
}
