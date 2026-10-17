import { defineConfig } from 'vitest/config'

// PowerSync's Node driver runs SQLite in worker threads, which hang inside Vitest's thread pool.
export default defineConfig({
  test: {
    pool: 'forks',
    // CI fails when coverage drops below these floors. Raise them as tests are added.
    coverage: {
      include: ['src/**'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { statements: 90, branches: 84, functions: 83, lines: 92 },
    },
  },
})
