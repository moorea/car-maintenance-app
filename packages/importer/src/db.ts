import type pg from 'pg'
import type { ImportDb } from './run.ts'

/** The import's database over node-postgres, calling the functions in the bulletins migration. */
export const postgresDb = (client: pg.ClientBase): ImportDb => ({
  ownedModelYears: async () => {
    const { rows } = await client.query<{
      make: string
      model: string
      year: number
      waiting: boolean
    }>('select make, model, year, waiting from public.nhtsa_owned_model_years()')
    return rows
  },

  importedEtags: async () => {
    const { rows } = await client.query<{ file: string; etag: string }>(
      'select file, etag from public.nhtsa_imports',
    )
    return new Map(rows.map((r) => [r.file, r.etag]))
  },

  storeBulletins: async ({ make, model, year }, rows) => {
    await client.query('select public.nhtsa_store_bulletins($1, $2, $3, $4::jsonb)', [
      make,
      model,
      year,
      JSON.stringify(rows),
    ])
  },

  storeMiles: async (rows) => {
    await client.query('select public.nhtsa_store_complaint_miles($1::jsonb)', [
      JSON.stringify(rows),
    ])
  },

  refreshMileage: async () => {
    await client.query('select public.nhtsa_refresh_complaint_mileage()')
  },

  recordImported: async (etags) => {
    await client.query(
      `insert into public.nhtsa_imports (file, etag, imported_at)
       select key, value, now() from jsonb_each_text($1::jsonb)
       on conflict (file) do update set etag = excluded.etag, imported_at = excluded.imported_at`,
      [JSON.stringify(Object.fromEntries(etags))],
    )
  },
})
