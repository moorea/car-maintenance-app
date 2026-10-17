import { defineConfig } from 'vitest/config'

// PowerSync's Node driver runs SQLite in worker threads, which hang inside Vitest's thread pool.
export default defineConfig({ test: { pool: 'forks' } })
