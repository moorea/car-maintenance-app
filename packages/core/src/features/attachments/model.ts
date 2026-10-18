import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  AttachmentError,
  type Attachment,
  type AttachmentKind,
  type PickedFile,
  type VehicleId,
} from '../../domain/types'
import type {
  AttachmentRepo,
  Clock,
  FilePicker,
  FilePreview,
  FileSource,
  IdGenerator,
  Unsubscribe,
} from '../../ports'
import {
  attachmentName,
  checkPickedFile,
  describeAttachment,
  newestAttachmentsFirst,
  type AttachmentItem,
} from './files'

/** What a new attachment is and where it goes: the car itself, or one of its services. */
export interface AttachTarget {
  kind: AttachmentKind
  serviceRecordId?: string | undefined
}

export interface AttachmentsState {
  status: 'loading' | 'ready'
  attachments: Attachment[]
  /** The car's own documents (registration, insurance), newest first. */
  documents: AttachmentItem[]
  /** The car's own documents by kind, newest first, for the renewal each one goes with. */
  documentsByKind: Partial<Record<AttachmentKind, AttachmentItem[]>>
  /** Receipts and photos by the service they belong to, newest first. */
  byService: Record<string, AttachmentItem[]>
  /** True while a picked file is being saved. */
  adding: boolean
  /** Why the last attach failed. Cleared by the next attempt. */
  error?: string | undefined
  /**
   * The attachment being opened: downloading to this phone, or why it could not be. Cleared once
   * the system viewer shows it.
   */
  opening?: { id: string; error?: string | undefined } | undefined
  /** The attachment the owner asked to delete, until they confirm or cancel. */
  confirmingRemove?: string | undefined
}

export interface AttachmentsActions {
  start: () => void
  /** Asks the system for a photo or file and attaches it. Resolves true once saved. */
  attach: (target: AttachTarget, source: FileSource) => Promise<boolean>
  /**
   * Shows an attachment in the system viewer, downloading it first if this phone has no copy.
   * Opening it again after a failure retries.
   */
  open: (id: string) => Promise<void>
  /** Asks the owner to confirm deleting an attachment. */
  askRemove: (id: string) => void
  cancelRemove: () => void
  /** Deletes the attachment the owner confirmed. */
  remove: () => Promise<void>
  dispose: () => void
}

export type AttachmentsModel = StoreApi<AttachmentsState & AttachmentsActions>

export interface AttachmentsDeps {
  vehicleId: VehicleId
  attachments: AttachmentRepo
  picker: FilePicker
  preview: FilePreview
  clock: Clock
  ids: IdGenerator
}

const MESSAGES: Record<AttachmentError['kind'], string> = {
  denied: 'Allow access in Settings to attach photos.',
  offline: 'Connect to the internet to download this file.',
  'not-uploaded': 'This file is still uploading from another phone. Try again later.',
  unknown: 'Something went wrong. Try again.',
}

const messageFor = (error: unknown) =>
  error instanceof AttachmentError ? MESSAGES[error.kind] : MESSAGES.unknown

/** Saves a picked file as an attachment. Shared by the service log's form. */
export const saveAttachment = async (
  deps: Pick<AttachmentsDeps, 'attachments' | 'clock' | 'ids' | 'vehicleId'>,
  target: AttachTarget,
  file: PickedFile,
): Promise<Attachment> => {
  const attachment: Attachment = {
    id: deps.ids.next(),
    vehicleId: deps.vehicleId,
    ...(target.serviceRecordId !== undefined && { serviceRecordId: target.serviceRecordId }),
    kind: target.kind,
    name: attachmentName(file.name),
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    addedOn: deps.clock.today(),
  }
  await deps.attachments.add(attachment, file)
  return attachment
}

/** Picks a file and checks it can be attached. Resolves undefined if the owner cancelled. */
export const pickAttachable = async (
  picker: FilePicker,
  source: FileSource,
): Promise<{ file: PickedFile } | { error: string } | undefined> => {
  let file: PickedFile | undefined
  try {
    file = await picker.pick(source)
  } catch (e) {
    return { error: messageFor(e) }
  }
  if (!file) return undefined
  const problem = checkPickedFile(file)
  return problem ? { error: problem } : { file }
}

/**
 * Screen model for what is attached to a car: its documents and the receipts on its services.
 */
export const createAttachmentsModel = (deps: AttachmentsDeps): AttachmentsModel => {
  let unsubscribe: Unsubscribe | undefined
  // Each open supersedes the one before, so a slow download never shows over a newer one.
  let opening = 0

  return createStore<AttachmentsState & AttachmentsActions>()((set, get) => {
    const show = (attachments: Attachment[]) => {
      const today = deps.clock.today()
      const items = newestAttachmentsFirst(attachments).map((a) => describeAttachment(a, today))
      const byService: Record<string, AttachmentItem[]> = {}
      for (const item of items) {
        if (item.serviceRecordId === undefined) continue
        ;(byService[item.serviceRecordId] ??= []).push(item)
      }
      const documents = items.filter((i) => i.serviceRecordId === undefined)
      const documentsByKind: Partial<Record<AttachmentKind, AttachmentItem[]>> = {}
      for (const item of documents) (documentsByKind[item.kind] ??= []).push(item)
      return { attachments, documents, documentsByKind, byService }
    }

    const find = (id: string | undefined) => get().attachments.find((a) => a.id === id)

    return {
      status: 'loading',
      attachments: [],
      documents: [],
      documentsByKind: {},
      byService: {},
      adding: false,

      attach: async (target, source) => {
        if (get().adding) return false
        set({ error: undefined })
        const picked = await pickAttachable(deps.picker, source)
        if (!picked) return false
        if ('error' in picked) {
          set({ error: picked.error })
          return false
        }
        set({ adding: true })
        try {
          await saveAttachment(deps, target, picked.file)
          set({ adding: false })
          return true
        } catch {
          set({ adding: false, error: 'Could not save the file. Try again.' })
          return false
        }
      },

      open: async (id) => {
        const attachment = find(id)
        const current = get().opening
        // Already downloading; a tap after a failure retries.
        if (!attachment || (current?.id === id && current.error === undefined)) return
        const mine = ++opening
        set({ opening: { id } })
        try {
          const uri = await deps.attachments.open(attachment)
          if (mine !== opening) return
          await deps.preview.show(uri, attachment)
          if (mine === opening) set({ opening: undefined })
        } catch (e) {
          if (mine === opening) set({ opening: { id, error: messageFor(e) } })
        }
      },

      askRemove: (id) => set({ confirmingRemove: id }),

      cancelRemove: () => set({ confirmingRemove: undefined }),

      remove: async () => {
        const attachment = find(get().confirmingRemove)
        set({ confirmingRemove: undefined, error: undefined })
        if (!attachment) return
        try {
          await deps.attachments.remove(attachment)
        } catch {
          set({ error: 'Could not delete it. Try again.' })
        }
      },

      start: () => {
        if (unsubscribe) return
        unsubscribe = deps.attachments.watchForVehicle(deps.vehicleId, (attachments) =>
          set({ ...show(attachments), status: 'ready' }),
        )
      },

      dispose: () => {
        unsubscribe?.()
        unsubscribe = undefined
        opening++
      },
    }
  })
}
