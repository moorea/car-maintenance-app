import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `pnpm test` (and CI) fails when coverage drops below these floors. Raise them as tests are
    // added. A package's own `test` script skips coverage, so a single file can be run alone.
    coverage: {
      include: ['src/**'],
      // main.ts only reads Deno's environment; CI's smoke test loads and calls it in Deno.
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: { statements: 95, branches: 72, functions: 98, lines: 98 },
    },
  },
})
