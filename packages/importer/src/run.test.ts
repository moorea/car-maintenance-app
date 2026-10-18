import { describe, expect, it } from 'vitest'
import type { BulletinRow, MilesRow, ModelYear } from './parse.ts'
import { MILES_BATCH, runImport, type Files, type ImportDb } from './run.ts'
import type { Source } from './sources.ts'

const CRV = { make: 'honda', model: 'cr-v', year: 2017 }

const SOURCES: Source[] = [
  { kind: 'bulletins', url: 'tsbs-2015', from: 2015, to: 2019 },
  { kind: 'bulletins', url: 'tsbs-2010', from: 2010, to: 2014 },
  { kind: 'complaints', url: 'cmpl-2015', from: 2015, to: 2019 },
]

const tsb = (id: number, model = 'CR-V') =>
  [
    id,
    '',
    '20190520',
    `T-${id}`,
    '20190501',
    '',
    'SERVICE BULLETIN',
    'HONDA',
    model,
    '2017',
    'ENGINE',
    '',
    '',
    'Summary.',
  ].join('\t')

const complaint = (odi: number, miles: number) =>
  ['1', odi, 'Honda', 'HONDA', 'CR-V', '2017', ...Array(11).fill(''), miles].join('\t')

const fakeDb = (
  owned: (ModelYear & { waiting: boolean; bulletins?: number })[],
  etags = new Map<string, string>(),
) => {
  const stored = {
    bulletins: [] as { modelYear: ModelYear; rows: BulletinRow[] }[],
    miles: [] as MilesRow[][],
    refreshed: 0,
    imported: undefined as Map<string, string> | undefined,
  }
  const db: ImportDb = {
    ownedModelYears: async () => owned.map((o) => ({ bulletins: 0, ...o })),
    importedEtags: async () => etags,
    storeBulletins: async (modelYear, rows) => void stored.bulletins.push({ modelYear, rows }),
    storeMiles: async (rows) => void stored.miles.push(rows),
    refreshMileage: async () => void stored.refreshed++,
    recordImported: async (e) => void (stored.imported = e),
    transaction: async (store) => {
      const before = { bulletins: stored.bulletins.length, miles: stored.miles.length }
      try {
        await store()
      } catch (e) {
        stored.bulletins.length = before.bulletins
        stored.miles.length = before.miles
        throw e
      }
    },
  }
  return { db, stored }
}

const fakeFiles = (
  contents: Record<string, string[]>,
  etags: Record<string, string | undefined> = {},
) => {
  const read: string[] = []
  const files: Files = {
    etag: async (url) => (url in etags ? etags[url] : `etag-${url}`),
    lines: async function* (url) {
      read.push(url)
      const lines = contents[url]
      if (!lines) throw new Error(`${url} answered 503`)
      yield* lines
    },
  }
  return { files, read }
}

const CONTENTS = {
  'tsbs-2015': [tsb(1), tsb(2, 'CIVIC')],
  'cmpl-2015': [complaint(11, 88_000), complaint(12, 0)],
}

const log = () => {}

describe('runImport', () => {
  it('stores bulletins and complaint mileages for every owned model year', async () => {
    const { db, stored } = fakeDb([{ ...CRV, waiting: true }])
    const { files, read } = fakeFiles(CONTENTS)
    const result = await runImport({ db, files, sources: SOURCES, log })
    expect(result).toEqual({ status: 'imported', modelYears: 1, bulletins: 1, miles: 1 })
    expect(read).toEqual(['tsbs-2015', 'cmpl-2015'])
    expect(stored.bulletins).toEqual([
      { modelYear: CRV, rows: [expect.objectContaining({ nhtsa_id: 1 })] },
    ])
    expect(stored.miles).toEqual([[{ odi_number: 11, miles: 88_000 }]])
    expect(stored.refreshed).toBe(1)
    expect(stored.imported).toEqual(
      new Map([
        ['tsbs-2015', 'etag-tsbs-2015'],
        ['cmpl-2015', 'etag-cmpl-2015'],
      ]),
    )
  })

  it('does nothing when no file changed and no model year waits', async () => {
    const etags = new Map([
      ['tsbs-2015', 'etag-tsbs-2015'],
      ['cmpl-2015', 'etag-cmpl-2015'],
    ])
    const { db, stored } = fakeDb([{ ...CRV, waiting: false }], etags)
    const { files, read } = fakeFiles(CONTENTS)
    expect(await runImport({ db, files, sources: SOURCES, log })).toEqual({ status: 'up-to-date' })
    expect(read).toEqual([])
    expect(stored.imported).toBeUndefined()
  })

  it('imports again when a file changed, or when forced', async () => {
    const etags = new Map([
      ['tsbs-2015', 'old'],
      ['cmpl-2015', 'etag-cmpl-2015'],
    ])
    const changed = fakeDb([{ ...CRV, waiting: false }], etags)
    await runImport({ db: changed.db, files: fakeFiles(CONTENTS).files, sources: SOURCES, log })
    expect(changed.stored.bulletins).toHaveLength(1)

    const forced = fakeDb([{ ...CRV, waiting: false }], new Map(changed.stored.imported))
    await runImport({
      db: forced.db,
      files: fakeFiles(CONTENTS).files,
      sources: SOURCES,
      log,
      force: true,
    })
    expect(forced.stored.bulletins).toHaveLength(1)
  })

  it('treats a file with no ETag as changed and does not record it', async () => {
    const { db, stored } = fakeDb([{ ...CRV, waiting: false }])
    const { files } = fakeFiles(CONTENTS, { 'tsbs-2015': undefined })
    await runImport({ db, files, sources: SOURCES, log })
    expect([...(stored.imported?.keys() ?? [])]).toEqual(['cmpl-2015'])
  })

  it('stores nothing when a download fails', async () => {
    const { db, stored } = fakeDb([{ ...CRV, waiting: true }])
    const { files } = fakeFiles({ 'tsbs-2015': CONTENTS['tsbs-2015'] })
    await expect(runImport({ db, files, sources: SOURCES, log })).rejects.toThrow('503')
    expect(stored.bulletins).toEqual([])
    expect(stored.miles).toEqual([])
  })

  it('stops before storing when the files no longer look like NHTSA’s layout', async () => {
    const { db, stored } = fakeDb([{ ...CRV, waiting: true }])
    const { files } = fakeFiles({
      'tsbs-2015': ['a,b,c', 'd,e,f', tsb(1)],
      'cmpl-2015': CONTENTS['cmpl-2015'],
    })
    await expect(runImport({ db, files, sources: SOURCES, log })).rejects.toThrow(
      'has the layout changed?',
    )
    expect(stored.bulletins).toEqual([])
  })

  it('stops when a kind of file is empty', async () => {
    const { db } = fakeDb([{ ...CRV, waiting: true }])
    const { files } = fakeFiles({ 'tsbs-2015': CONTENTS['tsbs-2015'], 'cmpl-2015': [] })
    await expect(runImport({ db, files, sources: SOURCES, log })).rejects.toThrow('had no lines')
  })

  it('stores an empty list for a model year the files do not mention, clearing old bulletins', async () => {
    const { db, stored } = fakeDb([{ make: 'kia', model: 'soul', year: 2016, waiting: true }])
    await runImport({ db, files: fakeFiles(CONTENTS).files, sources: SOURCES, log })
    expect(stored.bulletins).toEqual([expect.objectContaining({ rows: [] })])
  })

  it('stops rather than wipe most of a model year’s bulletins, unless forced', async () => {
    const { files } = fakeFiles({
      'tsbs-2015': [tsb(1)],
      'tsbs-2010': [],
      'cmpl-2015': [complaint(9, 1)],
    })
    const { db, stored } = fakeDb([{ ...CRV, waiting: false, bulletins: 40 }])
    await expect(runImport({ db, files, sources: SOURCES, log: () => {} })).rejects.toThrow(
      '2017 honda cr-v (40 to 1)',
    )
    expect(stored.bulletins).toEqual([])
    await runImport({ db, files, sources: SOURCES, log: () => {}, force: true })
    expect(stored.bulletins[0]?.rows).toHaveLength(1)
  })

  it('stores nothing when storing fails part way', async () => {
    const { db, stored } = fakeDb([{ ...CRV, waiting: true }])
    db.refreshMileage = async () => {
      throw new Error('connection lost')
    }
    const { files } = fakeFiles({
      'tsbs-2015': [tsb(1)],
      'tsbs-2010': [],
      'cmpl-2015': [complaint(9, 1)],
    })
    await expect(runImport({ db, files, sources: SOURCES, log: () => {} })).rejects.toThrow(
      'connection lost',
    )
    expect(stored.bulletins).toEqual([])
    expect(stored.imported).toBeUndefined()
  })

  it('stores mileages in batches', async () => {
    const many = Array.from({ length: MILES_BATCH + 1 }, (_, i) => complaint(i + 1, 1_000))
    const { db, stored } = fakeDb([{ ...CRV, waiting: true }])
    const { files } = fakeFiles({ ...CONTENTS, 'cmpl-2015': many })
    await runImport({ db, files, sources: SOURCES, log })
    expect(stored.miles.map((b) => b.length)).toEqual([MILES_BATCH, 1])
  })

  it('does nothing before anyone owns a car', async () => {
    const { db } = fakeDb([])
    const { files, read } = fakeFiles(CONTENTS)
    expect(await runImport({ db, files, sources: SOURCES, log })).toEqual({
      status: 'nothing-owned',
    })
    expect(read).toEqual([])
  })
})
