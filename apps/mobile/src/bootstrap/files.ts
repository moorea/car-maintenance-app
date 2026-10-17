import { AttachmentError, type FilePicker, type FilePreview, type PickedFile } from '@car/core'
import type { DeviceFiles } from '@car/data'
import { Directory, File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'

const PHOTO_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // Re-encodes as JPEG at a size that keeps a receipt legible but small to upload.
  quality: 0.7,
}

const photoName = () => `Photo ${new Date().toISOString().slice(0, 10)}.jpg`

/** The camera and photo library (expo-image-picker) and the Files app picker (expo-file-system). */
export const systemFilePicker = (): FilePicker => ({
  pick: async (source): Promise<PickedFile | undefined> => {
    if (source === 'files') {
      const picked = await File.pickFileAsync({ mimeTypes: ['image/*', 'application/pdf'] })
      if (picked.canceled) return undefined
      const file = picked.result
      return { uri: file.uri, name: file.name, contentType: file.type, sizeBytes: file.size }
    }
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) throw new AttachmentError('denied')
    }
    // The photo library needs no permission: the system picker only hands over what is chosen.
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PHOTO_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PHOTO_OPTIONS)
    const asset = result.canceled ? undefined : result.assets[0]
    if (!asset) return undefined
    return {
      uri: asset.uri,
      name: asset.fileName ?? photoName(),
      contentType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? new File(asset.uri).size,
    }
  },
})

/** Quick Look on iOS: zoom, share, print and markup come with it. */
export const systemFilePreview = (): FilePreview => ({
  show: (uri) => new File(uri).preview(),
})

/**
 * Attachment files kept in the app's own documents folder, named by attachment id. They stay
 * across launches, so a file opened once can be shown offline.
 */
export const appFiles = (): DeviceFiles => {
  const dir = new Directory(Paths.document, 'attachments')
  const file = (name: string) => {
    if (!dir.exists) dir.create({ idempotent: true, intermediates: true })
    return new File(dir, name)
  }
  const clear = (name: string) => {
    const f = file(name)
    if (f.exists) f.delete()
    return f
  }
  return {
    copy: (fromUri, name) => new File(fromUri).copy(clear(name)),
    download: async (url, name) => {
      await File.downloadFileAsync(url, clear(name))
    },
    move: (from, to) => file(from).move(clear(to)),
    read: async (name) => {
      const f = file(name)
      return f.exists ? f.bytes() : undefined
    },
    uri: async (name) => {
      const f = file(name)
      return f.exists ? f.uri : undefined
    },
    list: async () =>
      dir.exists ? dir.list().flatMap((entry) => (entry instanceof File ? [entry.name] : [])) : [],
    remove: async (name) => {
      clear(name)
    },
  }
}
