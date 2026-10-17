import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // CI fails when coverage drops below these floors. Raise them as tests are added.
    coverage: {
      include: ['src/**'],
      // main.ts only reads Deno's environment; CI's smoke test loads and calls it in Deno.
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: { statements: 95, branches: 72, functions: 98, lines: 98 },
    },
  },
})
