import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `pnpm test` (and CI) fails when coverage drops below these floors. Raise them as tests are
    // added. A package's own `test` script skips coverage, so a single file can be run alone.
    coverage: {
      include: ['src/**'],
      // The in-memory adapters are test doubles, exercised by the tests that use them.
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      thresholds: { statements: 95, branches: 83, functions: 95, lines: 97 },
    },
  },
})
