import { defineConfig } from 'vitest/config'

// PowerSync's Node driver runs SQLite in worker threads, which hang inside Vitest's thread pool.
export default defineConfig({
  test: {
    pool: 'forks',
    // `pnpm test` (and CI) fails when coverage drops below these floors. Raise them as tests are
    // added. A package's own `test` script skips coverage, so a single file can be run alone.
    coverage: {
      include: ['src/**'],
      // The Node device files are a test double, exercised by the tests that use them.
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      thresholds: { statements: 94, branches: 88, functions: 90, lines: 97 },
    },
  },
})
