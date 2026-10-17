import type { Attachment, AttachmentKind, PickedFile } from '../../domain/types'
import { formatDay } from '../../lib/format'
import type { IsoDate } from '../../lib/date'

/** The file types the app accepts: photos and PDFs. Storage refuses anything else. */
export const ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const

/** The largest file the app uploads: 25 MB, enough for a multi-page scanned PDF. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const KIND_TITLES: Record<Exclude<AttachmentKind, 'other'>, string> = {
  receipt: 'Receipt',
  registration: 'Registration',
  insurance: 'Insurance card',
}

export const isPdf = (a: Pick<Attachment, 'contentType'>) => a.contentType === 'application/pdf'

/** Why a picked file cannot be attached, or undefined if it can. */
export const checkPickedFile = (file: PickedFile): string | undefined => {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.contentType))
    return 'Choose a photo or a PDF.'
  if (file.sizeBytes > MAX_ATTACHMENT_BYTES) return 'That file is over 25 MB.'
  return undefined
}

/** "240 KB", "1.2 MB". */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The name without its extension: "Insurance card.pdf" is "Insurance card". */
const baseName = (name: string) => name.replace(/\.[A-Za-z0-9]{1,5}$/, '') || name

/** One attachment as a list shows it. */
export interface AttachmentItem {
  id: string
  serviceRecordId?: string | undefined
  /** "Registration", "Receipt", or the file's name for anything else. */
  title: string
  /** "PDF · 240 KB · Oct 2". */
  detail: string
  pdf: boolean
}

export const describeAttachment = (a: Attachment, today: IsoDate): AttachmentItem => ({
  id: a.id,
  serviceRecordId: a.serviceRecordId,
  title: a.kind === 'other' ? baseName(a.name) : KIND_TITLES[a.kind],
  detail: [isPdf(a) ? 'PDF' : 'Photo', formatBytes(a.sizeBytes), formatDay(a.addedOn, today)].join(
    ' · ',
  ),
  pdf: isPdf(a),
})

/** Newest first. Attachments added the same day keep the repository's order. */
export const newestAttachmentsFirst = (attachments: readonly Attachment[]): Attachment[] =>
  [...attachments].sort((a, b) => b.addedOn.localeCompare(a.addedOn))
