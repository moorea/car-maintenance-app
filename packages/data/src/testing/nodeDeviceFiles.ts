import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { DeviceFiles } from '../files'

const isMissing = (error: unknown) => (error as { code?: string }).code === 'ENOENT'

const pathOf = (uri: string) => (uri.startsWith('file:') ? fileURLToPath(uri) : uri)

/**
 * DeviceFiles over a folder on disk, for tests on Node. Only tests import it, so the app bundle
 * never pulls in node:fs.
 */
export const nodeDeviceFiles = (dir: string, doFetch: typeof fetch = fetch): DeviceFiles => {
  const at = (name: string) => join(dir, name)
  const ready = mkdir(dir, { recursive: true })
  return {
    copy: async (fromUri, name) => {
      await ready
      await copyFile(pathOf(fromUri), at(name))
    },
    download: async (url, name) => {
      await ready
      const response = await doFetch(url)
      if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`)
      await writeFile(at(name), new Uint8Array(await response.arrayBuffer()))
    },
    move: async (from, to) => {
      await ready
      await rename(at(from), at(to))
    },
    read: async (name) => {
      try {
        return new Uint8Array(await readFile(at(name)))
      } catch (error) {
        if (isMissing(error)) return undefined
        throw error
      }
    },
    uri: async (name) => {
      try {
        await stat(at(name))
        return pathToFileURL(at(name)).href
      } catch (error) {
        if (isMissing(error)) return undefined
        throw error
      }
    },
    list: async () => {
      await ready
      return readdir(dir)
    },
    remove: async (name) => {
      await rm(at(name), { force: true })
    },
  }
}
