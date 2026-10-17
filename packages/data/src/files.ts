/**
 * A private folder of files on this phone, addressed by name. Attachments keep their local copy
 * here under the attachment's id. The app implements it over expo-file-system; tests use
 * `nodeDeviceFiles` in `src/testing`.
 */
export interface DeviceFiles {
  /** Copies the file at `fromUri` (as a picker or camera returns it) to `name`, replacing it. */
  copy(fromUri: string, name: string): Promise<void>
  /** Downloads `url` to `name`. Rejects on a network failure or a response that is not 2xx. */
  download(url: string, name: string): Promise<void>
  /** Renames `from` to `to`, replacing `to`. */
  move(from: string, to: string): Promise<void>
  /** The file's bytes, or undefined if there is no such file. */
  read(name: string): Promise<Uint8Array | undefined>
  /** A URI the app can show or share the file from, or undefined if there is no such file. */
  uri(name: string): Promise<string | undefined>
  /** The names of every file in the folder. */
  list(): Promise<string[]>
  /** Deletes the file; does nothing if there is none. */
  remove(name: string): Promise<void>
}
