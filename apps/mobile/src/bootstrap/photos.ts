import { MAX_QUOTE_PHOTO_BASE64, type PhotoPicker, type QuotePhoto } from '@car/core'
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  UIImagePickerPreferredAssetRepresentationMode,
  type ImagePickerOptions,
  type ImagePickerResult,
} from 'expo-image-picker'

// A compressed JPEG keeps a phone photo of a page well under the 5 MB Claude accepts, and still
// sharp enough to read. "Compatible" makes iOS hand over JPEG rather than HEIC, which Claude
// cannot read.
const OPTIONS: ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.5,
  base64: true,
  exif: false,
  preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
}

const toPhoto = (result: ImagePickerResult): QuotePhoto | undefined => {
  const asset = result.canceled ? undefined : result.assets[0]
  if (!asset?.base64) return undefined
  if (asset.base64.length > MAX_QUOTE_PHOTO_BASE64) throw new Error('The photo is too large')
  const mediaType =
    asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
      ? asset.mimeType
      : 'image/jpeg'
  return { mediaType, base64: asset.base64 }
}

/** The camera and photo library through expo-image-picker. Photos stay in memory, never saved. */
export const expoPhotoPicker = (): PhotoPicker => ({
  take: async () => {
    const permission = await requestCameraPermissionsAsync()
    if (!permission.granted) throw new Error('Camera access was denied')
    return toPhoto(await launchCameraAsync(OPTIONS))
  },
  // The system photo picker runs outside the app, so the library needs no permission.
  choose: async () => toPhoto(await launchImageLibraryAsync(OPTIONS)),
})
