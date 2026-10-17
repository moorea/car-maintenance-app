import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { darkColors, lightColors } from '../../mobile/src/theme/colors'
import { buildSite, contactEmail, findPlaceholders, renderPolicy } from './site'
import { cssVar } from './theme'

const repo = join(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(join(repo, path), 'utf8')
const policy = read('docs/app-store/privacy-policy.md')
const styles = read('apps/site/src/styles.css')

const build = (overrides: { policyMarkdown?: string; siteUrl?: string } = {}) =>
  buildSite({
    appName: 'Car Maintenance',
    policyMarkdown: policy,
    styles,
    light: lightColors,
    dark: darkColors,
    siteUrl: 'https://example.com',
    year: 2026,
    ...overrides,
  })

const pages = (files: Record<string, string>) =>
  Object.entries(files).filter(([path]) => path.endsWith('.html'))

const attr = (html: string, name: 'href' | 'src' | 'srcset') =>
  [...html.matchAll(new RegExp(`${name}="([^"]+)"`, 'g'))].map((m) => m[1] as string)

describe('the site', () => {
  it('has a landing page, privacy policy, support page and a not-found page', () => {
    expect(Object.keys(build().files)).toEqual(
      expect.arrayContaining([
        'index.html',
        'privacy/index.html',
        'support/index.html',
        '404.html',
      ]),
    )
  })

  it('links only to pages and files it publishes', () => {
    const { files } = build()
    const published = (path: string) =>
      path in files ||
      `${path}index.html` in files ||
      existsSync(join(repo, 'apps/site/public', path)) ||
      path === 'icon.png'
    for (const [page, html] of pages(files)) {
      const local = [...attr(html, 'href'), ...attr(html, 'src'), ...attr(html, 'srcset')]
        .filter((url) => url.startsWith('/'))
        .map((url) => url.slice(1).split('#')[0] as string)
      for (const path of local) expect(published(path), `${page} links to /${path}`).toBe(true)
    }
  })

  it('serves every link under the base path when hosted in a subfolder', () => {
    const { files } = build({ siteUrl: 'https://moorea.github.io/car-maintenance-app' })
    for (const [, html] of pages(files)) {
      const local = [...attr(html, 'href'), ...attr(html, 'src')].filter((u) => u.startsWith('/'))
      for (const url of local) expect(url).toMatch(/^\/car-maintenance-app\//)
    }
    expect(files['sitemap.xml']).toContain(
      '<loc>https://moorea.github.io/car-maintenance-app/privacy/</loc>',
    )
  })

  it('publishes the privacy policy from its markdown, every section included', () => {
    const html = build().files['privacy/index.html']
    const headings = [...policy.matchAll(/^#+ (.+)$/gm)].map((m) => m[1] as string)
    expect(headings.length).toBeGreaterThan(5)
    for (const heading of headings) expect(html).toContain(`>${heading.replace(/'/g, '&#39;')}<`)
    expect(html).toContain('<div class="table"><table>')
  })

  it('keeps marketing copy to claims the app can make today', () => {
    const { files } = build()
    const copy = [files['index.html'], files['support/index.html']].join('\n')
    for (const banned of [
      /your manufacturer's schedule/i,
      /your car has a recall/i,
      /AI mechanic/i,
      /diagnos/i,
      /free forever|no subscription|\bfree trial\b/i,
    ])
      expect(copy).not.toMatch(banned)
  })
})

describe('policy blanks', () => {
  it('lists the blanks still to fill in and marks them on the page', () => {
    const md = 'Email **[CONTACT EMAIL]**, stored in [REGION]. See [the app](https://x.y).'
    expect(findPlaceholders(md)).toEqual(['[CONTACT EMAIL]', '[REGION]'])
    expect(renderPolicy(md)).toContain('<mark class="todo">[REGION]</mark>')
  })

  it('shows the blank contact address on the support page until it is filled in', () => {
    const md = '# Privacy policy\n\nQuestions or requests: **[CONTACT EMAIL]**.'
    const site = build({ policyMarkdown: md })
    expect(site.placeholders).toEqual(['[CONTACT EMAIL]'])
    expect(site.files['support/index.html']).toContain('<mark class="todo">[CONTACT EMAIL]</mark>')
    expect(site.files['support/index.html']).not.toContain('mailto:')
  })

  it('takes the contact address only from the questions line, not other addresses in the policy', () => {
    const md =
      '# Privacy policy\n\nQuestions or requests: **[CONTACT EMAIL]**.\n\nVendor: privacy@vendor.com'
    expect(contactEmail(md)).toBeUndefined()
    expect(contactEmail(`${md}\n`.replace('[CONTACT EMAIL]', 'us@example.com'))).toBe(
      'us@example.com',
    )
  })

  it('uses the address from the policy once it is filled in', () => {
    const md = '# Privacy policy\n\nQuestions or requests: **help@example.com**.'
    expect(contactEmail(md)).toBe('help@example.com')
    const site = build({ policyMarkdown: md })
    expect(site.placeholders).toEqual([])
    expect(site.files['support/index.html']).toContain('href="mailto:help@example.com"')
    expect(site.files['privacy/index.html']).toContain('href="mailto:help@example.com"')
  })
})

describe('colours', () => {
  it('defines every semantic role from the app for light and dark', () => {
    const css = build().files['theme.css'] as string
    const [light, dark] = css.split('@media (prefers-color-scheme: dark)') as [string, string]
    for (const [role, value] of Object.entries(lightColors))
      expect(light).toContain(`${cssVar(role)}: ${value};`)
    for (const [role, value] of Object.entries(darkColors))
      expect(dark).toContain(`${cssVar(role)}: ${value};`)
  })

  it('names roles as kebab-case CSS variables', () => {
    expect(cssVar('textPrimary')).toBe('--text-primary')
    expect(cssVar('glass')).toBe('--glass')
  })

  it('uses only theme variables in the stylesheet, never a colour literal', () => {
    const withoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/)
    expect(withoutComments).not.toMatch(
      /(?:color|background|border[\w-]*|fill|stroke|box-shadow)\s*:[^;]*\b(?:white|black|red|gray|grey|blue|green|orange|transparent)\b/,
    )
    const used = [...withoutComments.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1])
    const defined = Object.keys(lightColors).map(cssVar)
    for (const v of used) expect(defined).toContain(v)
  })
})
