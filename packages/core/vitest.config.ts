import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // CI fails when coverage drops below these floors. Raise them as tests are added.
    coverage: {
      include: ['src/**'],
      // The in-memory adapters are test doubles, exercised by the tests that use them.
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      thresholds: { statements: 95, branches: 83, functions: 95, lines: 97 },
    },
  },
})
