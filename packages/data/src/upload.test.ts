import { UpdateType, type CrudEntry, type CrudTransaction } from '@powersync/common'
import { describe, expect, it } from 'vitest'
import {
  applyCrud,
  isPermanent,
  uploadPending,
  type BackendError,
  type CrudBackend,
  type UploadContext,
} from './upload'

const entry = (op: UpdateType, table: string, opData?: Record<string, unknown>) =>
  ({ op, table, id: 'row1', clientId: 1, ...(opData ? { opData } : {}) }) as CrudEntry

/** Records each call and answers with the next scripted error, or success. */
const fakeBackend = (errors: (BackendError | null)[] = []) => {
  const calls: unknown[][] = []
  const next = async () => errors.shift() ?? null
  const backend: CrudBackend = {
    insert: (...args) => (calls.push(['insert', ...args]), next()),
    upsert: (...args) => (calls.push(['upsert', ...args]), next()),
    update: (...args) => (calls.push(['update', ...args]), next()),
    remove: (...args) => (calls.push(['remove', ...args]), next()),
    putFile: (path, bytes, contentType) => (
      calls.push(['putFile', path, [...bytes], contentType]),
      next()
    ),
    removeFile: (...args) => (calls.push(['removeFile', ...args]), next()),
  }
  return { backend, calls }
}

/** The phone's files: attachment `row1` has a local copy unless `missing`. */
const context = (missing = false): UploadContext => ({
  userId: 'user-a',
  readFile: async (id) => (id === 'row1' && !missing ? new Uint8Array([7, 8]) : undefined),
})

describe('applyCrud', () => {
  it('inserts into append-only tables, so a retried insert cannot become an update', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(
      backend,
      entry(UpdateType.PUT, 'service_records', { shop: 'Quick Lube' }),
      context(),
    )
    await applyCrud(backend, entry(UpdateType.PUT, 'odometer_readings', { miles: 1 }), context())
    expect(calls).toEqual([
      ['insert', 'service_records', { shop: 'Quick Lube', id: 'row1' }],
      ['insert', 'odometer_readings', { miles: 1, id: 'row1' }],
    ])
  })

  it('keeps a service without its schedule item when the server does not know the item', async () => {
    const { backend, calls } = fakeBackend([{ code: '23503', message: 'item_id fkey' }])
    const dropped = await applyCrud(
      backend,
      entry(UpdateType.PUT, 'service_records', { vehicle_id: 'car', item_id: 'gone' }),
      context(),
    )
    expect(dropped).toBeNull()
    expect(calls).toEqual([
      ['insert', 'service_records', { vehicle_id: 'car', item_id: 'gone', id: 'row1' }],
      ['insert', 'service_records', { vehicle_id: 'car', item_id: null, id: 'row1' }],
    ])
  })

  it('drops a service whose car is gone, after one try without its item', async () => {
    const missing = { code: '23503', message: 'vehicle_id fkey' }
    const { backend, calls } = fakeBackend([missing, missing])
    const dropped = await applyCrud(
      backend,
      entry(UpdateType.PUT, 'service_records', { vehicle_id: 'gone', item_id: 'item' }),
      context(),
    )
    expect(dropped).toEqual(missing)
    expect(calls).toHaveLength(2)
  })

  it('upserts vehicles with their id', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.PUT, 'vehicles', { nickname: 'Civic' }), context())
    expect(calls).toEqual([['upsert', 'vehicles', { nickname: 'Civic', id: 'row1' }]])
  })

  it('updates only the changed columns of a vehicle', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.PATCH, 'vehicles', { nickname: 'Civic' }), context())
    expect(calls).toEqual([['update', 'vehicles', 'row1', { nickname: 'Civic' }]])
  })

  it('deletes a service record by id', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.DELETE, 'service_records'), context())
    expect(calls).toEqual([['remove', 'service_records', 'row1']])
  })

  it.each([
    [UpdateType.PATCH, 'service_records'],
    [UpdateType.PATCH, 'odometer_readings'],
    [UpdateType.DELETE, 'odometer_readings'],
  ])('refuses %s on append-only %s instead of uploading it', async (op, table) => {
    const { backend, calls } = fakeBackend()
    const dropped = await applyCrud(backend, entry(op, table, {}), context())
    expect(calls).toEqual([])
    expect(dropped?.message).toMatch(/not allowed/)
  })

  it('uploads a warranty edit as an update, since warranties are editable', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.PATCH, 'warranties', { months: 30 }), context())
    expect(calls).toEqual([['update', 'warranties', 'row1', { months: 30 }]])
  })

  it('uploads a fill-up correction as an update, since fill-ups are editable', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(
      backend,
      entry(UpdateType.PATCH, 'fill_ups', { odometer_miles: 41_100 }),
      context(),
    )
    expect(calls).toEqual([['update', 'fill_ups', 'row1', { odometer_miles: 41_100 }]])
  })

  it('uploads a renewal as an update, since renewing moves its date on', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(
      backend,
      entry(UpdateType.PATCH, 'renewals', { due_on: '2027-11-01' }),
      context(),
    )
    expect(calls).toEqual([['update', 'renewals', 'row1', { due_on: '2027-11-01' }]])
  })

  it("uploads a changed interval as an update, and deleting the owner's item as a delete", async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(
      backend,
      entry(UpdateType.PATCH, 'custom_items', { interval_miles: 7_500 }),
      context(),
    )
    await applyCrud(backend, entry(UpdateType.DELETE, 'custom_items'), context())
    expect(calls).toEqual([
      ['update', 'custom_items', 'row1', { interval_miles: 7_500 }],
      ['remove', 'custom_items', 'row1'],
    ])
  })

  it('never uploads tables that are read-only on the device', async () => {
    const { backend, calls } = fakeBackend()
    const dropped = await applyCrud(
      backend,
      entry(UpdateType.PUT, 'maintenance_items', {}),
      context(),
    )
    expect(calls).toEqual([])
    expect(dropped?.message).toMatch(/read-only/)
  })

  it('drops a change the server rejects for good', async () => {
    const rejection = { code: '23505', status: 409, message: 'duplicate' }
    const { backend } = fakeBackend([rejection])
    expect(await applyCrud(backend, entry(UpdateType.PUT, 'vehicles', {}), context())).toEqual(
      rejection,
    )
  })

  it('throws on a temporary failure so the upload is retried', async () => {
    const { backend } = fakeBackend([{ status: 0, message: 'Failed to fetch' }])
    await expect(
      applyCrud(backend, entry(UpdateType.PUT, 'vehicles', {}), context()),
    ).rejects.toThrow(/Failed to fetch/)
  })
})

describe('applyCrud on attachments', () => {
  const photo = { owner_id: 'user-a', content_type: 'image/jpeg', name: 'Receipt.jpg' }

  it('stores the file in its owner’s folder before inserting the row', async () => {
    const { backend, calls } = fakeBackend()
    expect(await applyCrud(backend, entry(UpdateType.PUT, 'attachments', photo), context())).toBe(
      null,
    )
    expect(calls).toEqual([
      ['putFile', 'user-a/row1', [7, 8], 'image/jpeg'],
      ['insert', 'attachments', { ...photo, id: 'row1' }],
    ])
  })

  it('drops an attachment whose file is not on the phone, since nobody could ever open it', async () => {
    const { backend, calls } = fakeBackend()
    const dropped = await applyCrud(
      backend,
      entry(UpdateType.PUT, 'attachments', photo),
      context(true),
    )
    expect(dropped?.message).toMatch(/not on this phone/)
    expect(calls).toEqual([])
  })

  it.each([
    ['a type Storage refuses', { status: 415, message: 'invalid_mime_type' }],
    ['a file too large', { status: 413, message: 'Payload too large' }],
    ['a refusal by Storage’s RLS', { status: 403, message: 'row-level security' }],
  ])('drops the attachment without its row when Storage rejects %s', async (_, error) => {
    const { backend, calls } = fakeBackend([error])
    const dropped = await applyCrud(backend, entry(UpdateType.PUT, 'attachments', photo), context())
    expect(dropped).toEqual(error)
    expect(calls.map((c) => c[0])).toEqual(['putFile'])
  })

  it('retries the attachment, row and all, when Storage is unreachable', async () => {
    const { backend, calls } = fakeBackend([{ status: 0, message: 'Failed to fetch' }])
    await expect(
      applyCrud(backend, entry(UpdateType.PUT, 'attachments', photo), context()),
    ).rejects.toThrow(/Failed to fetch/)
    expect(calls.map((c) => c[0])).toEqual(['putFile'])
  })

  it('removes the stored file when the server refuses the row for good', async () => {
    const refusal = { code: '42501', status: 403, message: 'row-level security' }
    const { backend, calls } = fakeBackend([null, refusal])
    const dropped = await applyCrud(backend, entry(UpdateType.PUT, 'attachments', photo), context())
    expect(dropped).toEqual(refusal)
    expect(calls.map((c) => c[0])).toEqual(['putFile', 'insert', 'removeFile'])
  })

  it('keeps a receipt with the car when its service was deleted before it uploaded', async () => {
    const receipt = { ...photo, service_record_id: 'gone' }
    const { backend, calls } = fakeBackend([null, { code: '23503', status: 409, message: 'fk' }])
    const dropped = await applyCrud(
      backend,
      entry(UpdateType.PUT, 'attachments', receipt),
      context(),
    )
    expect(dropped).toBeNull()
    const inserts = calls
      .filter((c) => c[0] === 'insert')
      .map((c) => (c[2] as typeof receipt).service_record_id)
    expect(inserts).toEqual(['gone', null])
    expect(calls.map((c) => c[0])).not.toContain('removeFile')
  })

  it('deletes the row, then the file in the signed-in user’s folder', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.DELETE, 'attachments'), context())
    expect(calls).toEqual([
      ['remove', 'attachments', 'row1'],
      ['removeFile', 'user-a/row1'],
    ])
  })

  it('retries a delete when Storage is unreachable after the row is gone', async () => {
    const { backend } = fakeBackend([null, { status: 503, message: 'unavailable' }])
    await expect(
      applyCrud(backend, entry(UpdateType.DELETE, 'attachments'), context()),
    ).rejects.toThrow(/unavailable/)
  })

  it('refuses to upload an edit to an attachment', async () => {
    const { backend, calls } = fakeBackend()
    const dropped = await applyCrud(backend, entry(UpdateType.PATCH, 'attachments', {}), context())
    expect(dropped?.message).toMatch(/not allowed/)
    expect(calls).toEqual([])
  })
})

describe('isPermanent', () => {
  it.each([
    ['bad data', { code: '22P02', status: 400 }],
    ['a constraint violation', { code: '23503', status: 409 }],
    ['an RLS refusal for a signed-in user', { code: '42501', status: 403 }],
    ['a column the server does not have', { code: 'PGRST204', status: 400 }],
    ['an update that matched no row', { status: 404 }],
  ])('treats %s as permanent', (_, error) => {
    expect(isPermanent({ ...error, message: '' })).toBe(true)
  })

  it.each([
    ['a request without a valid session', { code: '42501', status: 401 }],
    ['a timeout', { status: 408 }],
    ['rate limiting', { status: 429 }],
    ['a server error', { code: '57014', status: 503 }],
    ['a network failure', { status: 0 }],
  ])('retries %s', (_, error) => {
    expect(isPermanent({ ...error, message: '' })).toBe(false)
  })
})

describe('uploadPending', () => {
  const queue = (...transactions: CrudEntry[][]) => {
    const completed: number[] = []
    const pending = transactions.map((crud, i) => ({
      crud,
      complete: async () => void completed.push(i),
    })) as unknown as CrudTransaction[]
    return { db: { getNextCrudTransaction: async () => pending.shift() ?? null }, completed }
  }

  it('uploads every transaction in order and marks each complete', async () => {
    const { db, completed } = queue(
      [entry(UpdateType.PUT, 'vehicles', {})],
      [entry(UpdateType.PUT, 'service_records', {}), entry(UpdateType.DELETE, 'service_records')],
    )
    const { backend, calls } = fakeBackend()
    await uploadPending(db, backend, () => {}, context())
    expect(calls.map((c) => c[0])).toEqual(['upsert', 'insert', 'remove'])
    expect(completed).toEqual([0, 1])
  })

  it('completes a transaction past a dropped change and reports it', async () => {
    const { db, completed } = queue([entry(UpdateType.PATCH, 'vehicles', {})])
    const { backend } = fakeBackend([{ status: 404, message: 'no row updated' }])
    const dropped: string[] = []
    await uploadPending(db, backend, (_, error) => dropped.push(error.message), context())
    expect(dropped).toEqual(['no row updated'])
    expect(completed).toEqual([0])
  })

  it('leaves a transaction pending when the server is unreachable', async () => {
    const { db, completed } = queue([entry(UpdateType.PUT, 'vehicles', {})])
    const { backend } = fakeBackend([{ status: 0, message: 'Failed to fetch' }])
    await expect(uploadPending(db, backend, () => {}, context())).rejects.toThrow()
    expect(completed).toEqual([])
  })
})
