import type { DataFiles } from '@car/core'
import { Directory, File, Paths } from 'expo-file-system'
import { shareAsync } from 'expo-sharing'

/** A fresh, empty folder in the cache, so files from an earlier export or import never pile up. */
const freshFolder = (name: string) => {
  const dir = new Directory(Paths.cache, name)
  if (dir.exists) dir.delete()
  dir.create({ intermediates: true })
  return dir
}

/**
 * Exports go to the share sheet (Save to Files, AirDrop, Mail) and imports come from the Files
 * picker (expo-file-system and expo-sharing). Everything happens on the phone, so it works offline.
 */
export const appDataFiles = (): DataFiles => {
  let imports: Directory | undefined
  let staged = 0
  return {
    read: async (uri) => new File(uri).bytes(),
    share: async (bytes, name) => {
      const file = new File(freshFolder('export'), name)
      await file.write(bytes)
      await shareAsync(file.uri, {
        mimeType: 'application/zip',
        UTI: 'public.zip-archive',
        dialogTitle: name,
      })
    },
    pickArchive: async () => {
      const picked = await File.pickFileAsync({
        // Mail and cloud drives often label a zip as one of the others; readArchive checks it.
        mimeTypes: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      })
      if (picked.canceled) return undefined
      imports = freshFolder('import')
      return picked.result.bytes()
    },
    stage: async (bytes, { name, contentType }) => {
      imports ??= freshFolder('import')
      // Numbered, since two documents in an export may share a name, and short enough for any
      // file system; the attachment keeps its full name.
      const file = new File(imports, `${++staged}-${name.replace(/[/:]/g, '-').slice(-100)}`)
      await file.write(bytes)
      return { uri: file.uri, name, contentType, sizeBytes: bytes.length }
    },
  }
}
