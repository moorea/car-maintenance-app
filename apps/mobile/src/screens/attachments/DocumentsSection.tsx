import type { AttachmentKind } from '@car/core'
import { Column, Row, Spacer, Text } from '@expo/ui'
import { useColors } from '../../theme'
import { ActionMenu, type MenuGroup } from '../../ui/ActionMenu'
import { Note } from '../../ui/Note'
import type { SymbolName } from '../../ui/symbols'
import {
  AttachmentRows,
  AttachStatus,
  sourceActions,
  type AttachmentsProps,
} from './AttachmentList'

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const KINDS: { kind: AttachmentKind; title: string; symbol: SymbolName }[] = [
  { kind: 'registration', title: 'Registration', symbol: 'document' },
  { kind: 'insurance', title: 'Insurance card', symbol: 'document' },
  { kind: 'other', title: 'Other document', symbol: 'paperclip' },
]

/** The car's own papers: registration, insurance card and anything else worth keeping. */
export function DocumentsSection(props: AttachmentsProps) {
  const colors = useColors()
  const groups: MenuGroup[] = KINDS.map((k) => ({
    title: k.title,
    symbol: k.symbol,
    actions: sourceActions((source) => void props.attach({ kind: k.kind }, source)),
  }))
  return (
    <Column spacing={8}>
      <Row alignment="center" style={{ paddingHorizontal: 4 }}>
        <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>DOCUMENTS</Text>
        <Spacer flexible />
        <ActionMenu label="Add a document" symbol="plus" variant="icon" groups={groups} />
      </Row>
      {props.documents.length > 0 ? (
        <AttachmentRows {...props} items={props.documents} />
      ) : props.status === 'ready' ? (
        <Note>
          Add your registration and insurance card to keep them on your phone, even offline.
        </Note>
      ) : null}
      <AttachStatus adding={props.adding} error={props.error} />
    </Column>
  )
}
