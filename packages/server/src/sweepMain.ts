// Entry point of the scheduled file sweep. `pnpm --filter @car/server build` bundles it into
// packages/server/dist/sweep-files.mjs, which .github/workflows/sweep-files.yml runs with Node.
import { sweepOrphanedFiles } from './sweep'

declare const process: { env: Record<string, string | undefined>; exitCode?: number }

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const result = await sweepOrphanedFiles({
  url: env('SUPABASE_URL'),
  serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
})
console.log(
  `Deleted ${result.deleted} orphaned file(s)${result.more ? '; more remain for the next run' : ''}.`,
)
