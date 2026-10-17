// Writes the site to dist/. Run through build.mjs; SITE_URL is where it will be served.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { darkColors, lightColors } from '../../mobile/src/theme/colors'
import { buildSite } from './site'

const root = join(import.meta.dirname, '..')
const repo = join(root, '../..')
const out = join(root, 'dist')
const read = (path: string) => readFileSync(join(repo, path), 'utf8')

const app = JSON.parse(read('apps/mobile/app.json')) as { expo: { name: string } }

const site = buildSite({
  appName: app.expo.name,
  policyMarkdown: read('docs/app-store/privacy-policy.md'),
  styles: read('apps/site/src/styles.css'),
  light: lightColors,
  dark: darkColors,
  siteUrl: (process.env.SITE_URL || 'http://localhost:4321').replace(/\/+$/, ''),
  year: new Date().getUTCFullYear(),
})

rmSync(out, { recursive: true, force: true })
cpSync(join(root, 'public'), out, { recursive: true })
cpSync(join(repo, 'apps/mobile/assets/icon.png'), join(out, 'icon.png'))
for (const [path, contents] of Object.entries(site.files)) {
  mkdirSync(dirname(join(out, path)), { recursive: true })
  writeFileSync(join(out, path), contents)
}

console.log(`Built ${Object.keys(site.files).length} files into ${out}`)
if (site.placeholders.length > 0) {
  // A GitHub Actions annotation, so the blanks show on the workflow run until they are filled.
  console.log(
    `::warning title=Privacy policy has blanks::Fill in ${site.placeholders.join(', ')} in docs/app-store/privacy-policy.md`,
  )
}
