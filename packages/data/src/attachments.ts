import { AttachmentError, type AttachmentRepo } from '@car/core'
import type { CommonPowerSyncDatabase } from '@powersync/common'
import type { DeviceFiles } from './files'
import { now, watchRows } from './repositories'
import { fromAttachment, toAttachment } from './rows'
import { attachmentPath } from './upload'

export interface AttachmentRepoOptions {
  db: CommonPowerSyncDatabase
  /** Where this phone keeps its copy of each file, named by attachment id. */
  files: DeviceFiles
  /** A short-lived URL to download a Storage path from; rejects with AttachmentError. */
  downloadUrl: (path: string) => Promise<string>
  log?: (message: string) => void
}

export interface PowerSyncAttachmentRepo extends AttachmentRepo {
  /** Stops removing files whose attachment was deleted. */
  dispose(): void
}

const FOR_VEHICLE =
  'select * from attachments where vehicle_id = ? order by added_on desc, created_at desc'

/** A download in progress, renamed to the attachment's id only once complete. */
const PART = '.part'

/**
 * Attachments over PowerSync. The row syncs like any other; the file is copied into `files` when
 * attached, uploaded by the upload queue before the row (see upload.ts), and downloaded the first
 * time it is opened on another phone.
 */
export const createAttachmentRepo = ({
  db,
  files,
  downloadUrl,
  log = console.warn,
}: AttachmentRepoOptions): PowerSyncAttachmentRepo => {
  // Adds, removes and cleanups take turns, so a cleanup never sees a file that add() copied
  // before the row that keeps it has been inserted.
  let queue: Promise<unknown> = Promise.resolve()
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task)
    queue = run.catch(() => {})
    return run
  }

  const downloads = new Map<string, Promise<string>>()

  // Deletes local files with no attachment row: deleted on another phone, a local add whose upload
  // was dropped, or a copy cleared at sign-out. One pass waiting is enough for any number of
  // changes.
  let cleanupWaiting = false
  const cleanUp = () => {
    if (cleanupWaiting) return
    cleanupWaiting = true
    serially(async () => {
      cleanupWaiting = false
      const rows = await db.getAll<{ id: string }>('select id from attachments')
      const ids = new Set(rows.map((r) => r.id))
      for (const name of await files.list()) {
        const id = name.endsWith(PART) ? name.slice(0, -PART.length) : name
        if (ids.has(id) || downloads.has(id)) continue
        await files.remove(name)
      }
    }).catch((error: unknown) => log(`Attachment file cleanup failed: ${String(error)}`))
  }
  const stopCleanup = watchRows(db, 'select id from attachments', [], 'attachments', cleanUp)

  const download = async (id: string): Promise<string> => {
    const local = await files.uri(id)
    if (local) return local
    const row = await db.getOptional<{ owner_id: string | null }>(
      'select owner_id from attachments where id = ?',
      [id],
    )
    if (!row?.owner_id) throw new AttachmentError('unknown', `No attachment ${id} on this phone`)
    let url: string
    try {
      url = await downloadUrl(attachmentPath(row.owner_id, id))
    } catch (error) {
      if (error instanceof AttachmentError) throw error
      throw new AttachmentError('unknown', String(error))
    }
    try {
      await files.download(url, id + PART)
    } catch (error) {
      await files.remove(id + PART).catch(() => {})
      throw new AttachmentError('offline', String(error))
    }
    await files.move(id + PART, id)
    const uri = await files.uri(id)
    if (!uri) throw new AttachmentError('unknown', `The download of ${id} went missing`)
    return uri
  }

  return {
    watchForVehicle: (vehicleId, onChange) =>
      watchRows(db, FOR_VEHICLE, [vehicleId], 'attachments', (rows) =>
        onChange(rows.map(toAttachment)),
      ),

    add: (attachment, picked) =>
      serially(async () => {
        // The file goes in its owner's Storage folder, and the owner is whoever owns the car.
        const car = await db.getOptional<{ owner_id: string | null }>(
          'select owner_id from vehicles where id = ?',
          [attachment.vehicleId],
        )
        if (!car?.owner_id) throw new Error(`No car ${attachment.vehicleId} on this phone`)
        await files.copy(picked.uri, attachment.id)
        try {
          const row = { ...fromAttachment(car.owner_id, attachment), created_at: now() }
          const columns = Object.keys(row)
          await db.execute(
            `insert into attachments (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
            Object.values(row),
          )
        } catch (error) {
          await files.remove(attachment.id).catch(() => {})
          throw error
        }
      }),

    open: (attachment) => {
      const { id } = attachment
      const running = downloads.get(id)
      if (running) return running
      const opening = download(id).finally(() => downloads.delete(id))
      downloads.set(id, opening)
      return opening
    },

    // The upload queue then deletes the server's row and the file in Storage.
    remove: (attachment) =>
      serially(async () => {
        await db.execute('delete from attachments where id = ?', [attachment.id])
        await files.remove(attachment.id)
      }),

    dispose: stopCleanup,
  }
}
