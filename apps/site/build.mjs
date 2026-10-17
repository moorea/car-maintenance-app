// Bundles the site generator (it reads the app's colour roles from apps/mobile) and runs it.
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const outfile = join(mkdtempSync(join(tmpdir(), 'car-site-')), 'build.mjs')
await build({
  entryPoints: ['src/main.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // The bundle runs from a temporary folder; keep paths relative to the source.
  define: {
    'import.meta.dirname': JSON.stringify(join(dirname(fileURLToPath(import.meta.url)), 'src')),
  },
  logLevel: 'warning',
})
await import(pathToFileURL(outfile).href)
