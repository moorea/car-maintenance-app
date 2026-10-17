import { UpdateType, type CrudEntry, type CrudTransaction } from '@powersync/common'
import { describe, expect, it } from 'vitest'
import { applyCrud, uploadPending, type BackendError, type CrudBackend } from './upload'

const entry = (op: UpdateType, table: string, opData?: Record<string, unknown>) =>
  ({ op, table, id: 'row1', clientId: 1, ...(opData ? { opData } : {}) }) as CrudEntry

/** Records each call and answers with the next scripted error, or success. */
const fakeBackend = (errors: (BackendError | null)[] = []) => {
  const calls: unknown[][] = []
  const next = async () => errors.shift() ?? null
  const backend: CrudBackend = {
    upsert: (...args) => (calls.push(['upsert', ...args]), next()),
    update: (...args) => (calls.push(['update', ...args]), next()),
    remove: (...args) => (calls.push(['remove', ...args]), next()),
  }
  return { backend, calls }
}

describe('applyCrud', () => {
  it('upserts an insert with its id', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.PUT, 'service_records', { shop: 'Quick Lube' }))
    expect(calls).toEqual([['upsert', 'service_records', { shop: 'Quick Lube', id: 'row1' }]])
  })

  it('updates only the changed columns of a patch', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.PATCH, 'vehicles', { nickname: 'Civic' }))
    expect(calls).toEqual([['update', 'vehicles', 'row1', { nickname: 'Civic' }]])
  })

  it('deletes by id', async () => {
    const { backend, calls } = fakeBackend()
    await applyCrud(backend, entry(UpdateType.DELETE, 'service_records'))
    expect(calls).toEqual([['remove', 'service_records', 'row1']])
  })

  it('never uploads tables that are read-only on the device', async () => {
    const { backend, calls } = fakeBackend()
    const dropped = await applyCrud(backend, entry(UpdateType.PUT, 'maintenance_items', {}))
    expect(calls).toEqual([])
    expect(dropped?.message).toMatch(/read-only/)
  })

  it.each(['22P02', '23505', '42501'])(
    'drops a change the server rejects for good (%s)',
    async (code) => {
      const { backend } = fakeBackend([{ code, message: 'rejected' }])
      const dropped = await applyCrud(backend, entry(UpdateType.PATCH, 'service_records', {}))
      expect(dropped).toEqual({ code, message: 'rejected' })
    },
  )

  it('throws on a temporary failure so the upload is retried', async () => {
    const { backend } = fakeBackend([{ message: 'Failed to fetch' }])
    await expect(applyCrud(backend, entry(UpdateType.PUT, 'vehicles', {}))).rejects.toThrow(
      /Failed to fetch/,
    )
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
    await uploadPending(db, backend, () => {})
    expect(calls.map((c) => c[0])).toEqual(['upsert', 'upsert', 'remove'])
    expect(completed).toEqual([0, 1])
  })

  it('completes a transaction past a dropped change and reports it', async () => {
    const { db, completed } = queue([entry(UpdateType.PATCH, 'service_records', {})])
    const { backend } = fakeBackend([{ code: '42501', message: 'append-only' }])
    const dropped: string[] = []
    await uploadPending(db, backend, (_, error) => dropped.push(error.message))
    expect(dropped).toEqual(['append-only'])
    expect(completed).toEqual([0])
  })

  it('leaves a transaction pending when the server is unreachable', async () => {
    const { db, completed } = queue([entry(UpdateType.PUT, 'vehicles', {})])
    const { backend } = fakeBackend([{ message: 'Failed to fetch' }])
    await expect(uploadPending(db, backend, () => {})).rejects.toThrow()
    expect(completed).toEqual([])
  })
})
