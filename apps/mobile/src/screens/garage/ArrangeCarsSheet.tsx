import type { ArrangeCarsActions, ArrangeCarsState, ArrangeRow } from '@car/core'
import { BottomSheet, Column, Row, ScrollView, Spacer } from '@expo/ui'
import { Fragment } from 'react'
import { useColors } from '../../theme'
import { Button } from '../../ui/Button'
import { ErrorText, Note } from '../../ui/Note'
import { Card, FillColumn, GlassIconButton, Separator } from '../../ui/surfaces'
import { Text } from '../../ui/Text'

type Props = ArrangeCarsState & Pick<ArrangeCarsActions, 'moveUp' | 'moveDown' | 'close' | 'save'>

/** The sheet for putting the owner's cars in the order they want in the garage. */
export function ArrangeCarsSheet(props: Props) {
  return (
    <BottomSheet
      isPresented={props.form !== undefined}
      onDismiss={props.close}
      snapPoints={['full']}
      contentPadding={0}
    >
      <ArrangeCarsForm {...props} />
    </BottomSheet>
  )
}

/** Room for a move button, so a row without one keeps its buttons lined up with the rest. */
const BUTTON = 44

function ArrangeCarsForm({ form, moveUp, moveDown, close, save }: Props) {
  if (!form) return null
  return (
    <ScrollView>
      <Column spacing={12} style={{ padding: 16 }}>
        <Row alignment="center">
          <Button variant="text" label="Cancel" disabled={form.saving} onPress={close} />
          <Spacer flexible />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Reorder cars</Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={form.saving ? 'Saving…' : 'Done'}
            disabled={form.saving}
            onPress={() => void save()}
          />
        </Row>
        <Card padding={0}>
          {form.cars.map((car, i) => (
            <Fragment key={car.id}>
              {i > 0 ? <Separator /> : null}
              <CarRow
                car={car}
                first={i === 0}
                last={i === form.cars.length - 1}
                onUp={() => moveUp(car.id)}
                onDown={() => moveDown(car.id)}
              />
            </Fragment>
          ))}
        </Card>
        <Note>The garage lists your cars in this order, on all your phones.</Note>
        {form.error ? <ErrorText>{form.error}</ErrorText> : null}
      </Column>
    </ScrollView>
  )
}

function CarRow(props: {
  car: ArrangeRow
  first: boolean
  last: boolean
  onUp: () => void
  onDown: () => void
}) {
  const colors = useColors()
  const { car } = props
  return (
    <Row
      alignment="center"
      spacing={8}
      style={{ paddingLeft: 16, paddingRight: 8, paddingVertical: 8 }}
    >
      <FillColumn spacing={2}>
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{car.title}</Text>
        {car.detail ? (
          <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>{car.detail}</Text>
        ) : null}
      </FillColumn>
      {props.first ? (
        <Column style={{ width: BUTTON }} />
      ) : (
        <GlassIconButton symbol="moveUp" label={`Move ${car.title} up`} onPress={props.onUp} />
      )}
      {props.last ? (
        <Column style={{ width: BUTTON }} />
      ) : (
        <GlassIconButton
          symbol="moveDown"
          label={`Move ${car.title} down`}
          onPress={props.onDown}
        />
      )}
    </Row>
  )
}
