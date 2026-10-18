import { describe, expect, it } from 'vitest'
import { serviceRecordDraftSchema } from './serviceRecord'
import { NOTES_MAX, SHORT_TEXT_MAX } from './text'
import { warrantyDraftSchema, type WarrantyDraft } from './warranty'

const service = {
  performedOn: '2026-10-17',
  itemId: '',
  odometerMiles: '',
  cost: '',
  shop: '',
  notes: '',
}
const warranty: WarrantyDraft = {
  kind: 'basic',
  provider: '',
  startsOn: '2024-01-01',
  months: '36',
  endMiles: '',
  policyNumber: '',
  notes: '',
}

describe('free text on forms', () => {
  it('keeps text up to what the server stores', () => {
    const notes = 'n'.repeat(NOTES_MAX)
    const shop = 's'.repeat(SHORT_TEXT_MAX)
    expect(serviceRecordDraftSchema.parse({ ...service, shop, notes })).toMatchObject({
      shop,
      notes,
    })
  })

  it.each([
    ['shop', SHORT_TEXT_MAX],
    ['notes', NOTES_MAX],
  ] as const)('refuses a service %s longer than the server stores', (field, max) => {
    const result = serviceRecordDraftSchema.safeParse({ ...service, [field]: 'x'.repeat(max + 1) })
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message: 'That is too long' })
  })

  it.each([
    ['provider', SHORT_TEXT_MAX],
    ['policyNumber', SHORT_TEXT_MAX],
    ['notes', NOTES_MAX],
  ] as const)('refuses a warranty %s longer than the server stores', (field, max) => {
    const result = warrantyDraftSchema.safeParse({ ...warranty, [field]: 'x'.repeat(max + 1) })
    expect(result.error?.issues[0]).toMatchObject({ path: [field], message: 'That is too long' })
  })

  it('measures text after trimming, so pasted whitespace does not count', () => {
    const notes = ` ${'n'.repeat(NOTES_MAX)} `
    expect(serviceRecordDraftSchema.parse({ ...service, notes }).notes).toHaveLength(NOTES_MAX)
  })
})
