import { describe, expect, it } from 'vitest'
import type { Attachment, PickedFile } from '../../domain/types'
import {
  fixedClock,
  memoryAttachments,
  memoryFilePicker,
  memoryFilePreview,
  sequentialIds,
} from '../../testing'
import { describeAttachment, formatBytes } from './files'
import { createAttachmentsModel } from './model'

const photo: PickedFile = {
  uri: 'file:///tmp/IMG_2041.jpg',
  name: 'IMG_2041.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 840_000,
}
const pdf: PickedFile = {
  uri: 'file:///tmp/Insurance card.pdf',
  name: 'Insurance card.pdf',
  contentType: 'application/pdf',
  sizeBytes: 120_000,
}

const registration: Attachment = {
  id: 'reg',
  vehicleId: 'v1',
  kind: 'registration',
  name: 'scan.pdf',
  contentType: 'application/pdf',
  sizeBytes: 245_760,
  addedOn: '2026-03-02',
}
const oilReceipt: Attachment = {
  id: 'oil-receipt',
  vehicleId: 'v1',
  serviceRecordId: 'oil',
  kind: 'receipt',
  name: 'IMG_1.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1_300_000,
  addedOn: '2026-08-14',
}
const otherCar: Attachment = { ...registration, id: 'other', vehicleId: 'v2' }

const setup = (initial = [registration, oilReceipt, otherCar], remote: string[] = []) => {
  const attachments = memoryAttachments(initial, { remote })
  const picker = memoryFilePicker()
  const preview = memoryFilePreview()
  const model = createAttachmentsModel({
    vehicleId: 'v1',
    attachments,
    picker,
    preview,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('att'),
  })
  model.getState().start()
  return { model, attachments, picker, preview }
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('attachments screen model', () => {
  it("lists the car's documents apart from the receipts on its services", () => {
    const { model } = setup()
    const s = model.getState()
    expect(s.status).toBe('ready')
    expect(s.documents).toEqual([
      {
        id: 'reg',
        kind: 'registration',
        title: 'Registration',
        detail: 'PDF · 240 KB · Mar 2',
        pdf: true,
      },
    ])
    expect(s.byService).toEqual({
      oil: [
        {
          id: 'oil-receipt',
          kind: 'receipt',
          serviceRecordId: 'oil',
          title: 'Receipt',
          detail: 'Photo · 1.2 MB · Aug 14',
          pdf: false,
        },
      ],
    })
  })

  it('groups the car’s documents by kind, for the renewal each goes with', async () => {
    const { model, picker } = setup()
    picker.queue(photo)
    await model.getState().attach({ kind: 'inspection' }, 'camera')
    const { documentsByKind } = model.getState()
    expect(documentsByKind.registration?.map((d) => d.id)).toEqual(['reg'])
    expect(documentsByKind.inspection?.map((d) => [d.id, d.title])).toEqual([
      ['att-1', 'Inspection report'],
    ])
    expect(documentsByKind.receipt).toBeUndefined()
  })

  it('attaches a picked photo to a service as a receipt, dated today', async () => {
    const { model, attachments, picker } = setup()
    picker.queue(photo)

    expect(
      await model.getState().attach({ kind: 'receipt', serviceRecordId: 'oil' }, 'camera'),
    ).toBe(true)

    expect(picker.asked).toEqual(['camera'])
    expect(attachments.files.get('att-1')).toEqual(photo)
    expect(model.getState().byService.oil?.map((i) => i.id)).toEqual(['att-1', 'oil-receipt'])
    expect(model.getState().attachments[0]).toEqual({
      id: 'att-1',
      vehicleId: 'v1',
      serviceRecordId: 'oil',
      kind: 'receipt',
      name: 'IMG_2041.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 840_000,
      addedOn: '2026-10-17',
    })
  })

  it("names other documents after the file and adds them to the car's documents", async () => {
    const { model, picker } = setup()
    picker.queue(pdf)
    await model.getState().attach({ kind: 'other' }, 'files')
    expect(model.getState().documents[0]).toMatchObject({ title: 'Insurance card', pdf: true })
  })

  it('keeps names within what the server stores, and names unnamed files', async () => {
    const { model, picker } = setup()
    picker.queue({ ...pdf, name: `${'a'.repeat(300)}.pdf` })
    await model.getState().attach({ kind: 'other' }, 'files')
    picker.queue({ ...pdf, name: '   ' })
    await model.getState().attach({ kind: 'other' }, 'files')
    expect(
      model
        .getState()
        .attachments.slice(0, 2)
        .map((a) => a.name),
    ).toEqual(['Document', 'a'.repeat(255)])
  })

  it('passes the name and type to the system viewer', async () => {
    const { model, preview } = setup()
    const shown: unknown[] = []
    preview.show = async (uri, file) => {
      shown.push([uri, file.name, file.contentType])
    }
    await model.getState().open('reg')
    expect(shown).toEqual([['memory://reg', 'scan.pdf', 'application/pdf']])
  })

  it('does nothing when the owner cancels the picker', async () => {
    const { model, attachments } = setup()
    expect(await model.getState().attach({ kind: 'insurance' }, 'photos')).toBe(false)
    expect(attachments.files.size).toBe(0)
    expect(model.getState().error).toBeUndefined()
  })

  it('explains how to allow access when the owner has refused it', async () => {
    const { model, picker } = setup()
    picker.deny()
    expect(await model.getState().attach({ kind: 'insurance' }, 'camera')).toBe(false)
    expect(model.getState().error).toBe('Allow access in Settings to attach photos.')
  })

  it('refuses files that are not photos or PDFs, or are too large', async () => {
    const { model, picker, attachments } = setup()
    picker.queue({ ...pdf, name: 'notes.docx', contentType: 'application/msword' })
    await model.getState().attach({ kind: 'other' }, 'files')
    expect(model.getState().error).toBe('Choose a photo or a PDF.')

    picker.queue({ ...pdf, sizeBytes: 0 })
    await model.getState().attach({ kind: 'other' }, 'files')
    expect(model.getState().error).toBe('That file is empty.')

    picker.queue({ ...pdf, sizeBytes: 26 * 1024 * 1024 })
    await model.getState().attach({ kind: 'other' }, 'files')
    expect(model.getState().error).toBe('That file is over 25 MB.')
    expect(attachments.files.size).toBe(0)
  })

  it('says so when the file cannot be saved, and clears it on the next try', async () => {
    const { model, picker, attachments } = setup()
    picker.queue(photo)
    attachments.failNextAdd('disk full')
    expect(await model.getState().attach({ kind: 'insurance' }, 'photos')).toBe(false)
    expect(model.getState()).toMatchObject({
      adding: false,
      error: 'Could not save the file. Try again.',
    })

    picker.queue(photo)
    expect(await model.getState().attach({ kind: 'insurance' }, 'photos')).toBe(true)
    expect(model.getState().error).toBeUndefined()
  })

  it('downloads a file this phone has no copy of, then shows it in the system viewer', async () => {
    const { model, attachments, preview } = setup(undefined, ['reg'])
    attachments.holdOpens()
    const opening = model.getState().open('reg')
    expect(model.getState().opening).toEqual({ id: 'reg' })

    attachments.releaseOpen()
    await opening
    expect(attachments.downloads).toEqual(['reg'])
    expect(preview.shown).toEqual(['memory://reg'])
    expect(model.getState().opening).toBeUndefined()
  })

  it('ignores more taps on a file while it downloads', async () => {
    const { model, attachments, preview } = setup()
    attachments.holdOpens()
    const first = model.getState().open('reg')
    void model.getState().open('reg')
    attachments.releaseOpen()
    await first
    await settle()
    expect(preview.shown).toEqual(['memory://reg'])
  })

  it('explains a file that cannot be downloaded offline, and retries on the next tap', async () => {
    const { model, attachments, preview } = setup()
    attachments.failNextOpen('offline')
    await model.getState().open('reg')
    expect(model.getState().opening).toEqual({
      id: 'reg',
      error: 'Connect to the internet to download this file.',
    })

    await model.getState().open('reg')
    expect(preview.shown).toEqual(['memory://reg'])
    expect(model.getState().opening).toBeUndefined()
  })

  it('says when a file is still uploading from another phone', async () => {
    const { model, attachments } = setup()
    attachments.failNextOpen('not-uploaded')
    await model.getState().open('reg')
    expect(model.getState().opening?.error).toMatch(/still uploading/)
  })

  it('shows only the latest file when the owner taps another during a download', async () => {
    const { model, attachments, preview } = setup()
    attachments.holdOpens()
    const first = model.getState().open('reg')
    const second = model.getState().open('oil-receipt')
    attachments.releaseOpen()
    await Promise.all([first, second])
    expect(preview.shown).toEqual(['memory://oil-receipt'])
  })

  it('deletes an attachment only once the owner confirms', async () => {
    const { model } = setup()
    model.getState().askRemove('reg')
    expect(model.getState().confirmingRemove).toBe('reg')
    model.getState().cancelRemove()
    expect(model.getState().confirmingRemove).toBeUndefined()
    await model.getState().remove()
    expect(model.getState().documents).toHaveLength(1)

    model.getState().askRemove('reg')
    await model.getState().remove()
    expect(model.getState().documents).toEqual([])
    expect(model.getState().confirmingRemove).toBeUndefined()
  })

  it('stops following changes once disposed', () => {
    const { model, attachments } = setup()
    model.getState().dispose()
    attachments.set([])
    expect(model.getState().documents).toHaveLength(1)
  })
})

describe('attachment descriptions', () => {
  it('give sizes in KB under a megabyte and MB above', () => {
    expect(formatBytes(300)).toBe('1 KB')
    expect(formatBytes(245_760)).toBe('240 KB')
    expect(formatBytes(1_300_000)).toBe('1.2 MB')
  })

  it('add the year to files attached in another year', () => {
    expect(
      describeAttachment({ ...registration, addedOn: '2025-03-02' }, '2026-10-17').detail,
    ).toBe('PDF · 240 KB · Mar 2, 2025')
  })
})
