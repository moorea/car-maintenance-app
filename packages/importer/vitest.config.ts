import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `pnpm test` (and CI) fails when coverage drops below these floors.
    coverage: {
      include: ['src/**'],
      // The real network, database and command line are exercised by CI's dry run against
      // NHTSA's files (.github/workflows/nhtsa-files.yml) and by the scheduled import.
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/db.ts', 'src/files.ts'],
      thresholds: { statements: 95, branches: 85, functions: 95, lines: 95 },
    },
  },
})
