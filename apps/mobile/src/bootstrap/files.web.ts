import type { FilePicker, FilePreview, PickedFile } from '@car/core'

/** The browser's file input. `capture` asks phones to open the camera. */
const chooseFile = (accept: string, capture: boolean) =>
  new Promise<PickedFile | undefined>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    if (capture) input.setAttribute('capture', 'environment')
    // Some browsers only open pickers for inputs in the document.
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      input.remove()
      const file = input.files?.[0]
      resolve(
        file && {
          uri: URL.createObjectURL(file),
          name: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        },
      )
    })
    input.addEventListener('cancel', () => {
      input.remove()
      resolve(undefined)
    })
    input.click()
  })

/** The web preview's pickers. Photos and PDFs stay in the browser; nothing uploads. */
export const systemFilePicker = (): FilePicker => ({
  pick: (source) =>
    chooseFile(source === 'files' ? 'image/*,application/pdf' : 'image/*', source === 'camera'),
})

/** Opens the file in a new browser tab, the web preview's stand-in for Quick Look. */
export const systemFilePreview = (): FilePreview => ({
  show: async (uri) => {
    window.open(uri, '_blank', 'noopener')
  },
})
