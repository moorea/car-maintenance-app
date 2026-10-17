import type { DataFiles } from '@car/core'

/** The web preview downloads exports and imports through the browser's file input. */
export const appDataFiles = (): DataFiles => ({
  read: async (uri) => new Uint8Array(await (await fetch(uri)).arrayBuffer()),
  share: async (bytes, name) => {
    const url = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
  pickArchive: () =>
    new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.zip,application/zip'
      input.style.display = 'none'
      document.body.appendChild(input)
      input.addEventListener('change', () => {
        input.remove()
        const file = input.files?.[0]
        if (!file) return resolve(undefined)
        void file.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)))
      })
      input.addEventListener('cancel', () => {
        input.remove()
        resolve(undefined)
      })
      input.click()
    }),
  stage: async (bytes, { name, contentType }) => ({
    uri: URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType })),
    name,
    contentType,
    sizeBytes: bytes.length,
  }),
})
