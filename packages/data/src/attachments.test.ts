import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AttachmentError, type Attachment, type PickedFile } from '@car/core'
import { PowerSyncDatabase } from '@powersync/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAttachmentRepo, type PowerSyncAttachmentRepo } from './attachments'
import { schema } from './schema'
import { nodeDeviceFiles } from './testing/nodeDeviceFiles'

let dir: string
let filesDir: string
let db: InstanceType<typeof PowerSyncDatabase>
let repo: PowerSyncAttachmentRepo | undefined
let server: Server | undefined

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'car-attachments-'))
  filesDir = join(dir, 'files')
  db = new PowerSyncDatabase({ schema, database: { dbFilename: 'test.db', dbLocation: dir } })
  await db.init()
  await db.execute(
    "insert into vehicles (id, owner_id, year, make, model, nickname) values ('v1', 'owner-a', 2021, 'Toyota', 'RAV4', 'RAV4')",
  )
})

afterEach(async () => {
  repo?.dispose()
  repo = undefined
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
  await db.close()
  rmSync(dir, { recursive: true, force: true })
})

const receipt: Attachment = {
  id: 'a1',
  vehicleId: 'v1',
  serviceRecordId: 'r1',
  kind: 'receipt',
  name: 'Oil change.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 3,
  addedOn: '2026-09-01',
}

/** A photo where the camera would leave it, outside the app's folder. */
const picked = (bytes = 'jpg'): PickedFile => {
  const path = join(dir, `picked-${Math.random()}.jpg`)
  writeFileSync(path, bytes)
  return { uri: `file://${path}`, name: 'Oil change.jpg', contentType: 'image/jpeg', sizeBytes: 3 }
}

const noDownloads = async (): Promise<string> => {
  throw new Error('Not expected to download')
}

const makeRepo = (downloadUrl: (path: string) => Promise<string> = noDownloads) => {
  repo = createAttachmentRepo({ db, files: nodeDeviceFiles(filesDir), downloadUrl })
  return repo
}

const waitFor = async (check: () => boolean | Promise<boolean>, what: string) => {
  const deadline = Date.now() + 5_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const localFiles = () => (existsSync(filesDir) ? readdirSync(filesDir).sort() : [])

/** Serves `body` at /file and counts the requests. */
const serve = async (body: string) => {
  const hits = { count: 0 }
  server = createServer((_, response) => {
    hits.count += 1
    // Slow enough that a second open arrives while the first is downloading.
    setTimeout(() => response.end(body), 50)
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}/file`, hits }
}

describe('PowerSync attachments', () => {
  it('reads back an added attachment with the same fields', async () => {
    const attachments = makeRepo()
    await attachments.add(receipt, picked())
    const seen: Attachment[][] = []
    const stop = attachments.watchForVehicle('v1', (list) => seen.push(list))
    await waitFor(() => seen.length > 0, 'the first update')
    stop()
    expect(seen[0]).toStrictEqual([receipt])
  })

  it('lists the attachments of a car for a one-off read', async () => {
    const attachments = makeRepo()
    await attachments.add(receipt, picked())
    expect(await attachments.listForVehicle('v1')).toStrictEqual([receipt])
    expect(await attachments.listForVehicle('other')).toEqual([])
  })

  it('leaves the service absent for a document of the car itself', async () => {
    const attachments = makeRepo()
    const { serviceRecordId: _, ...card } = { ...receipt, id: 'a2', kind: 'insurance' as const }
    await attachments.add(card, picked())
    const seen: Attachment[][] = []
    const stop = attachments.watchForVehicle('v1', (list) => seen.push(list))
    await waitFor(() => seen.length > 0, 'the first update')
    stop()
    expect(seen[0]).toStrictEqual([card])
  })

  it('files the attachment under the owner of its car', async () => {
    await makeRepo().add(receipt, picked())
    const row = await db.get<{ owner_id: string }>(
      'select owner_id from attachments where id = ?',
      ['a1'],
    )
    expect(row.owner_id).toBe('owner-a')
  })

  it('lists the newest first and tells the watcher about each change', async () => {
    const attachments = makeRepo()
    const seen: string[][] = []
    const stop = attachments.watchForVehicle('v1', (list) => seen.push(list.map((a) => a.id)))
    await waitFor(() => seen.length > 0, 'the first update')
    await attachments.add({ ...receipt, id: 'old', addedOn: '2026-01-01' }, picked())
    await attachments.add({ ...receipt, id: 'new', addedOn: '2026-06-01' }, picked())
    await waitFor(() => seen.at(-1)?.length === 2, 'both attachments')
    stop()
    expect(seen[0]).toEqual([])
    expect(seen.at(-1)).toEqual(['new', 'old'])
  })

  it('keeps a copy of the picked file on the phone and opens it without downloading', async () => {
    const attachments = makeRepo()
    await attachments.add(receipt, picked('photo bytes'))
    const uri = await attachments.open(receipt)
    expect(readFileSync(fileURLToPath(uri), 'utf8')).toBe('photo bytes')
  })

  it('refuses to attach to a car that is not on this phone, keeping no file', async () => {
    const attachments = makeRepo()
    await expect(attachments.add({ ...receipt, vehicleId: 'nope' }, picked())).rejects.toThrow(
      /No car/,
    )
    expect(localFiles()).toEqual([])
  })

  it('removes the copied file when the attachment cannot be saved', async () => {
    const failing = new Proxy(db, {
      get: (target, key, receiver) =>
        key === 'execute'
          ? async (sql: string, params?: unknown[]) => {
              if (sql.startsWith('insert into attachments')) throw new Error('disk full')
              return target.execute(sql, params)
            }
          : (Reflect.get(target, key, receiver) as unknown),
    })
    repo = createAttachmentRepo({
      db: failing,
      files: nodeDeviceFiles(filesDir),
      downloadUrl: noDownloads,
    })
    await expect(repo.add(receipt, picked())).rejects.toThrow('disk full')
    expect(localFiles()).toEqual([])
  })

  it('downloads a file attached on another phone the first time it is opened', async () => {
    const { url, hits } = await serve('from storage')
    const paths: string[] = []
    const attachments = makeRepo(async (path) => (paths.push(path), url))
    // Synced from the server: a row with no local file.
    await db.execute(
      "insert into attachments (id, owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on) values ('a1', 'owner-a', 'v1', 'receipt', 'x.jpg', 'image/jpeg', 12, '2026-09-01')",
    )
    const [first, second] = await Promise.all([
      attachments.open(receipt),
      attachments.open(receipt),
    ])
    expect(first).toBe(second)
    expect(readFileSync(fileURLToPath(first), 'utf8')).toBe('from storage')
    expect(paths).toEqual(['owner-a/a1'])
    expect(hits.count).toBe(1)

    await attachments.open(receipt)
    expect(hits.count).toBe(1)
    expect(localFiles()).toEqual(['a1'])
  })

  it('says the file is offline when there is no connection to download it', async () => {
    const attachments = makeRepo(async () => {
      throw new AttachmentError('offline')
    })
    await db.execute(
      "insert into attachments (id, owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on) values ('a1', 'owner-a', 'v1', 'receipt', 'x.jpg', 'image/jpeg', 12, '2026-09-01')",
    )
    await expect(attachments.open(receipt)).rejects.toMatchObject({ kind: 'offline' })
  })

  it('reports an unexpected failure to get the download link as unknown', async () => {
    const attachments = makeRepo(async () => {
      throw new TypeError('bad response')
    })
    await db.execute(
      "insert into attachments (id, owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on) values ('a1', 'owner-a', 'v1', 'receipt', 'x.jpg', 'image/jpeg', 12, '2026-09-01')",
    )
    await expect(attachments.open(receipt)).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('says the file is offline when the download breaks off, keeping no partial file', async () => {
    const attachments = makeRepo(async () => 'http://127.0.0.1:1/unreachable')
    await db.execute(
      "insert into attachments (id, owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on) values ('a1', 'owner-a', 'v1', 'receipt', 'x.jpg', 'image/jpeg', 12, '2026-09-01')",
    )
    await expect(attachments.open(receipt)).rejects.toMatchObject({ kind: 'offline' })
    expect(localFiles()).toEqual([])
  })

  it('deletes the attachment and its file, queueing the delete for upload', async () => {
    const attachments = makeRepo()
    await attachments.add(receipt, picked())
    await attachments.remove(receipt)
    expect(await db.getAll('select id from attachments')).toEqual([])
    expect(localFiles()).toEqual([])
    const ops = (await db.getAll<{ data: string }>('select data from ps_crud order by id'))
      .map((r) => JSON.parse(r.data) as { op: string; type: string })
      .filter((change) => change.type === 'attachments')
      .map((change) => change.op)
    expect(ops).toEqual(['PUT', 'DELETE'])
  })

  it('deletes local files whose attachment is gone, keeping the rest', async () => {
    const attachments = makeRepo()
    await attachments.add(receipt, picked())
    await attachments.add({ ...receipt, id: 'a2' }, picked())
    // A stray file from a copy cleared at sign-out, and a leftover partial download.
    writeFileSync(join(filesDir, 'stray'), 'x')
    writeFileSync(join(filesDir, 'gone.part'), 'x')
    // Deleted on another phone: the row disappears through sync.
    await db.execute("delete from attachments where id = 'a2'")
    await waitFor(() => localFiles().join() === 'a1', 'the cleanup')
  })

  it('deletes every kept file once the local copy is cleared at sign-out', async () => {
    const attachments = makeRepo()
    await attachments.add(receipt, picked())
    attachments.dispose()
    await db.disconnectAndClear()
    await attachments.cleanUp()
    expect(localFiles()).toEqual([])
  })

  it('never deletes a file added while a cleanup is due', async () => {
    const attachments = makeRepo()
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => attachments.add({ ...receipt, id: `a${i}` }, picked())),
    )
    await attachments.remove({ ...receipt, id: 'a0' })
    // Queued after every add and remove, so it sees their rows.
    await new Promise((resolve) => setTimeout(resolve, 200))
    await attachments.add({ ...receipt, id: 'a5' }, picked())
    expect(localFiles()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
  })
})
