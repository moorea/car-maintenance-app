import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { lines } from './parse.ts'
import type { Files } from './run.ts'

/** NHTSA's servers turn away requests without a browser-like or descriptive user agent. */
const HEADERS = {
  'user-agent': 'car-maintenance-app-importer (+https://github.com/moorea/car-maintenance-app)',
}

const fail = (url: string, response: Response) =>
  new Error(`${url} answered ${response.status} ${response.statusText}`)

/** Runs a command and resolves with its standard output, or rejects if it fails. */
const output = async (command: string, args: string[]) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] })
  const chunks: Buffer[] = []
  child.stdout.on('data', (c: Buffer) => chunks.push(c))
  const [code] = (await once(child, 'close')) as [number | null]
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${code}`)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * NHTSA's files over HTTPS. Each zip is downloaded to a temporary file and its text entries are
 * streamed out with `unzip`, which every GitHub runner has.
 */
export const httpFiles = (): Files => ({
  etag: async (url) => {
    const response = await fetch(url, { method: 'HEAD', headers: HEADERS })
    if (!response.ok) throw fail(url, response)
    return response.headers.get('etag') ?? response.headers.get('last-modified') ?? undefined
  },

  lines: async function* (url) {
    const dir = await mkdtemp(join(tmpdir(), 'nhtsa-'))
    try {
      const zip = join(dir, 'file.zip')
      const response = await fetch(url, { headers: HEADERS })
      if (!response.ok || !response.body) throw fail(url, response)
      await pipeline(Readable.fromWeb(response.body), createWriteStream(zip))
      // The tab-separated text is the .tsv entry, or in older zips the .txt one; anything else
      // in the zip, such as the comma-separated summary file, is left out.
      const entries = (await output('unzip', ['-Z1', zip])).split('\n').filter(Boolean)
      const tsv = entries.filter((e) => /\.tsv$/i.test(e))
      const text = tsv.length > 0 ? tsv : entries.filter((e) => /\.txt$/i.test(e))
      console.error(`${url} holds ${entries.join(', ')}; reading ${text.join(', ') || 'all'}`)
      const child = spawn('unzip', ['-p', zip, ...(text.length > 0 ? text : entries)], {
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      const closed = once(child, 'close')
      yield* lines(child.stdout)
      const [code] = (await closed) as [number | null]
      if (code !== 0) throw new Error(`unzip ${url} exited with ${code}`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
})
