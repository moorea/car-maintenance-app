import type { TireCondition, TireRow, TiresActions, TiresState } from '@car/core'
import { BottomSheet, Button, Column, Row, ScrollView, Spacer, Switch } from '@expo/ui'
import type { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Symbol } from '../../ui/Symbol'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { TextField } from '../../ui/TextField'
import { Card, FillColumn, FillRow, GlassIconButton, PillButton } from '../../ui/surfaces'
import { Text } from '../../ui/Text'

type Props = TiresState &
  Pick<
    TiresActions,
    | 'openNew'
    | 'openEdit'
    | 'setField'
    | 'setMounted'
    | 'closeForm'
    | 'save'
    | 'remove'
    | 'openSwap'
    | 'setSwapMiles'
    | 'closeSwap'
    | 'confirmSwap'
  > & {
    carName: string
    onBack: () => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const ADVICE_TEXT: Record<TireCondition, ColorRole> = {
  ok: 'textSecondary',
  inspect: 'warning',
  replace: 'danger',
}

/** Pure rendering of the tires model: each set's age, miles and tread, the form and the swap. */
export function TiresView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />
  const onCar = props.rows.filter((r) => r.mounted)
  const stored = props.rows.filter((r) => !r.mounted)

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={16}
          style={{ padding: 16, paddingTop: 60, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Row alignment="center">
            <GlassIconButton symbol="back" label="Back" onPress={props.onBack} />
            <Spacer flexible />
            <GlassIconButton symbol="plus" label="Add tires" onPress={props.openNew} />
          </Row>
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {props.carName.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Tires</Text>
          </Column>

          {props.rows.length === 0 ? (
            <Card>
              <Note>
                Add the tires on your car, and any set you store for winter or summer, to see how
                old they are and the miles on each. Tap + to start.
              </Note>
            </Card>
          ) : null}

          {onCar.length > 0 ? (
            <Section title="ON THE CAR">
              {onCar.map((row) => (
                <TireCard key={row.id} row={row} onEdit={() => props.openEdit(row.id)} />
              ))}
            </Section>
          ) : null}

          {stored.length > 0 ? (
            <Section title="STORED">
              {stored.map((row) => (
                <TireCard
                  key={row.id}
                  row={row}
                  onEdit={() => props.openEdit(row.id)}
                  onSwap={() => props.openSwap(row.id)}
                />
              ))}
            </Section>
          ) : null}

          <Card fill="accentSubtle" spacing={6}>
            <Text textStyle={{ fontSize: 15, fontWeight: '600' }}>Finding the age</Text>
            <Note>
              Tires age even in storage. The DOT code on the sidewall ends in four digits: the week
              and year they were made, so 2321 is week 23 of 2021. It may be on the inner side.
            </Note>
          </Card>
        </Column>
      </ScrollView>
      <BottomSheet
        isPresented={props.form !== undefined}
        onDismiss={props.closeForm}
        snapPoints={['full']}
        contentPadding={0}
      >
        <TireForm {...props} />
      </BottomSheet>
      <BottomSheet
        isPresented={props.swap !== undefined}
        onDismiss={props.closeSwap}
        snapPoints={['half']}
        contentPadding={0}
      >
        <SwapForm {...props} />
      </BottomSheet>
    </Host>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors()
  return (
    <Column spacing={8}>
      <Text
        textStyle={{ ...OVERLINE, color: colors.textSecondary }}
        style={{ paddingHorizontal: 4 }}
      >
        {title}
      </Text>
      {children}
    </Column>
  )
}

function TireCard({
  row,
  onEdit,
  onSwap,
}: {
  row: TireRow
  onEdit: () => void
  onSwap?: () => void
}) {
  const colors = useColors()
  return (
    <Card padding={14} spacing={10}>
      <FillRow spacing={12} onPress={onEdit}>
        <Symbol name="tire" size={26} color={colors.accent} />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{row.title}</Text>
          {row.subtitle ? (
            <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{row.subtitle}</Text>
          ) : null}
        </FillColumn>
        <Symbol name="chevron" size={14} color={colors.textSecondary} />
      </FillRow>
      <Column spacing={3}>
        <Text
          textStyle={{
            fontSize: 15,
            fontWeight: row.ageKnown ? '500' : '400',
            color: row.ageKnown ? colors.textPrimary : colors.textSecondary,
          }}
        >
          {row.age}
        </Text>
        <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>{row.miles}</Text>
        {row.tread ? (
          <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>{row.tread}</Text>
        ) : null}
      </Column>
      {row.advice ? (
        <Card fill="warningSubtle" padding={12}>
          <Row spacing={10} alignment="center">
            <Symbol name="warning" size={18} color={colors[ADVICE_TEXT[row.condition]]} />
            <FillColumn>
              <Text
                textStyle={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors[ADVICE_TEXT[row.condition]],
                }}
              >
                {row.advice}
              </Text>
            </FillColumn>
          </Row>
        </Card>
      ) : null}
      {onSwap ? (
        <Row>
          <PillButton label="Put on the car" onPress={onSwap} fill="accentSubtle" text="accent" />
        </Row>
      ) : null}
    </Card>
  )
}

function TireForm({ form, setField, setMounted, save, remove, closeForm }: Props) {
  const colors = useColors()
  if (!form) return null
  const { draft, fieldErrors: errors, saving } = form
  const isNew = form.id === undefined
  return (
    <ScrollView>
      <Column spacing={12} style={{ padding: 16 }}>
        <Row alignment="center">
          <Button variant="text" label="Cancel" disabled={saving} onPress={closeForm} />
          <Spacer flexible />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>
            {isNew ? 'Add tires' : 'Edit tires'}
          </Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={saving ? 'Saving…' : 'Save'}
            disabled={saving}
            onPress={() => void save()}
          />
        </Row>
        <TextField
          label="Name"
          value={draft.name}
          onChangeText={(v) => setField('name', v)}
          error={errors.name}
          placeholder="All-season, Winter, Summer"
        />
        <TextField
          label="Brand and model"
          value={draft.brand}
          onChangeText={(v) => setField('brand', v)}
          error={errors.brand}
          placeholder="e.g. Michelin CrossClimate 2"
        />
        <TextField
          label="Size"
          value={draft.size}
          onChangeText={(v) => setField('size', v)}
          error={errors.size}
          placeholder="e.g. 225/65R17"
          autoCapitalize="characters"
        />
        <TextField
          label="DOT code"
          value={draft.dotCode}
          onChangeText={(v) => setField('dotCode', v)}
          error={errors.dotCode}
          placeholder="Last 4 digits, e.g. 2321"
          autoCapitalize="characters"
        />
        <Note>The last four digits are the week and year the tires were made.</Note>
        {isNew ? (
          <Switch value={draft.mounted} onValueChange={setMounted} label="On the car now" />
        ) : null}
        {draft.mounted ? (
          <TextField
            label="Odometer when put on (mi)"
            value={draft.mountedAtMiles}
            onChangeText={(v) => setField('mountedAtMiles', v)}
            error={errors.mountedAtMiles}
            placeholder="e.g. 41,250"
            keyboardType="number-pad"
          />
        ) : null}
        <TextField
          label={isNew ? 'Miles already on them' : 'Miles from earlier seasons'}
          value={draft.priorMiles}
          onChangeText={(v) => setField('priorMiles', v)}
          error={errors.priorMiles}
          placeholder="Blank if new"
          keyboardType="number-pad"
        />
        <TextField
          label="Tread depth (32nds of an inch)"
          value={draft.treadDepth}
          onChangeText={(v) => setField('treadDepth', v)}
          error={errors.treadDepth}
          placeholder="Shallowest groove, e.g. 6"
          keyboardType="number-pad"
        />
        <TextField
          label="Notes"
          value={draft.notes}
          onChangeText={(v) => setField('notes', v)}
          error={errors.notes}
          placeholder="Where they are stored, road hazard plan"
        />
        {form.error ? <ErrorText>{form.error}</ErrorText> : null}
        {form.id ? (
          <Column spacing={6} style={{ paddingTop: 8 }}>
            <Row>
              <PillButton
                label={form.confirmingDelete ? 'Tap again to delete' : 'Delete tires'}
                onPress={() => void remove()}
                fill={form.confirmingDelete ? 'danger' : 'neutralSubtle'}
                text={form.confirmingDelete ? 'onDanger' : 'danger'}
              />
            </Row>
            {form.confirmingDelete ? (
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
                Their age reminders stop too.
              </Text>
            ) : null}
          </Column>
        ) : null}
      </Column>
    </ScrollView>
  )
}

function SwapForm({ swap, setSwapMiles, closeSwap, confirmSwap }: Props) {
  if (!swap) return null
  return (
    <Column spacing={12} style={{ padding: 16 }}>
      <Row alignment="center">
        <Button variant="text" label="Cancel" disabled={swap.saving} onPress={closeSwap} />
        <Spacer flexible />
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Swap tires</Text>
        <Spacer flexible />
        <Button
          variant="text"
          label={swap.saving ? 'Saving…' : 'Swap'}
          disabled={swap.saving}
          onPress={() => void confirmSwap()}
        />
      </Row>
      <Text textStyle={{ fontSize: 20, fontWeight: '700' }}>{swap.title}</Text>
      {swap.note ? <Note>{swap.note}</Note> : null}
      <TextField
        label="Odometer now (mi)"
        value={swap.miles}
        onChangeText={setSwapMiles}
        error={swap.error}
        placeholder="Miles on the dashboard"
        keyboardType="number-pad"
      />
      <Note>Each set keeps its own miles, so they pick up where they left off next season.</Note>
    </Column>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
