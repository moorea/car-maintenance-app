import { defineConfig } from 'vitest/config'

// End-to-end sync tests against a local Supabase and PowerSync (scripts/start-local-sync.sh).
// Kept out of `pnpm test`, which needs no services.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    // PowerSync's Node driver runs SQLite in worker threads, which hang inside Vitest's thread pool.
    pool: 'forks',
    // Each file signs in fresh users, so files can share the stack, but one at a time keeps the
    // single PowerSync instance's logs readable when something fails.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
