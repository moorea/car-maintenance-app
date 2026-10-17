import { marked } from 'marked'
import type { Colors } from '../../mobile/src/theme/colors'
import { themeCss } from './theme'

export interface SiteInput {
  /** The app's display name, from `expo.name` in apps/mobile/app.json. */
  appName: string
  /** docs/app-store/privacy-policy.md, the one source of the policy. */
  policyMarkdown: string
  /** The stylesheet, which reads colours only through the theme's CSS variables. */
  styles: string
  light: Colors
  dark: Colors
  /** Where the site is served, without a trailing slash, such as https://moorea.github.io/repo. */
  siteUrl: string
  year: number
}

export interface Site {
  /** Output path → contents, for the text files. Static assets are copied separately. */
  files: Record<string, string>
  /** Bracketed blanks such as `[CONTACT EMAIL]` that the policy still needs filled in. */
  placeholders: string[]
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PLACEHOLDER = /\[([A-Z][A-Z ]*[A-Z])\]/g
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/

export const findPlaceholders = (markdown: string) => [
  ...new Set([...markdown.matchAll(PLACEHOLDER)].map((m) => m[0])),
]

/** The policy's contact address, once `[CONTACT EMAIL]` has been replaced with a real one. */
export const contactEmail = (policyMarkdown: string) => EMAIL.exec(policyMarkdown)?.[0]

/** Shows unfilled blanks loudly rather than publishing them as if they were text. */
const markPlaceholders = (html: string) =>
  html.replace(PLACEHOLDER, (m) => `<mark class="todo">${m}</mark>`)

export const renderPolicy = (markdown: string) => {
  const html = marked.parse(markdown, { async: false, gfm: true })
  return markPlaceholders(
    html.replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, '</table></div>'),
  )
}

/** The text after the policy's `_Effective ..._` line, for the page description. */
const effectiveDate = (markdown: string) => /_Effective ([^_]+)_/.exec(markdown)?.[1]

type Page = 'home' | 'privacy' | 'support' | 'missing'

interface Shell {
  page: Page
  title: string
  description: string
  path: string
  body: string
}

export function buildSite(input: SiteInput): Site {
  const base = new URL(`${input.siteUrl}/`).pathname
  const href = (path: string) => `${base}${path}`
  const name = escape(input.appName)
  const email = contactEmail(input.policyMarkdown)
  const mailto = email
    ? `<a href="mailto:${escape(email)}">${escape(email)}</a>`
    : '<mark class="todo">[CONTACT EMAIL]</mark>'

  const shell = ({ page, title, description, path, body }: Shell) => {
    const nav = (target: Page, path: string, label: string) =>
      `<a href="${href(path)}"${page === target ? ' aria-current="page"' : ''}>${label}</a>`
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
${page === 'missing' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${escape(input.siteUrl)}/${path}">`}
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${escape(input.siteUrl)}/icon.png">
<meta name="theme-color" content="${input.light.background}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${input.dark.background}" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${href('icon.png')}">
<link rel="apple-touch-icon" href="${href('icon.png')}">
<link rel="stylesheet" href="${href('theme.css')}">
<link rel="stylesheet" href="${href('styles.css')}">
</head>
<body>
<header class="bar"><div class="wrap">
<a class="brand" href="${href('')}"><img src="${href('icon.png')}" alt="" width="30" height="30">${name}</a>
<nav aria-label="Site">${nav('privacy', 'privacy/', 'Privacy')}${nav('support', 'support/', 'Support')}</nav>
</div></header>
<main>
${body}
</main>
<footer><div class="wrap">
<span>© ${input.year} ${name}</span>
<nav aria-label="Footer"><a href="${href('privacy/')}">Privacy policy</a><a href="${href('support/')}">Support</a></nav>
</div></footer>
</body>
</html>
`
  }

  const shot = (key: string, alt: string) => `<picture class="phone">
<source srcset="${href(`screens/${key}-dark.webp`)}" media="(prefers-color-scheme: dark)">
<img src="${href(`screens/${key}-light.webp`)}" alt="${escape(alt)}" width="780" height="1690" loading="lazy">
</picture>`

  const home = shell({
    page: 'home',
    path: '',
    title: `${input.appName}: your car, explained`,
    description:
      "Know what your car needs, what's been recalled and what tends to break on your model, and ask anything about it in plain English.",
    body: `<section class="wrap hero">
<div>
<p class="eyebrow">${name} for iPhone</p>
<h1>Your car, explained.</h1>
<p class="lede">Know what your car needs, what's been recalled and what tends to break on your model, and ask anything about it in plain English.</p>
<div class="actions">
<span class="pill primary">Coming soon to the App Store</span>
<a class="pill secondary" href="#how">See how it works</a>
</div>
<p class="small">No dongle, no shop network, any make. US only for now.</p>
</div>
${shot('garage', 'The garage screen: the next service due, recalls for the model, and what is coming up.').replace('loading="lazy"', 'fetchpriority="high"')}
</section>

<section class="band surface"><div class="wrap"><div class="friend">
<p class="eyebrow">Why it exists</p>
<h2>The mechanic friend who isn't selling anything.</h2>
<p>Most of us drive a car we don't understand and pay for repairs we can't judge. The schedule is buried in a manual nobody opens, recalls sit on a government website, and the history is a pile of receipts in the glovebox.</p>
<p>Every app that could help has something to sell: partner shops, the dealer, a $60 dongle. ${name} has nothing to sell you. <strong>Add your car once, by VIN or by year, make and model, and it knows its schedule, its recalls and what other owners of the same model have reported.</strong></p>
</div></div></section>

<section class="wrap band" id="how">
<p class="eyebrow">Three moments it's built for</p>
<div class="moment">
<div class="copy">
<p class="quote">"Is this actually due?"</p>
<h2>Know what's due before the shop tells you.</h2>
<p>Your car's maintenance schedule, replanned from your odometer readings, with what you've already had done. Mileage-based reminders give you a heads-up two weeks before a service is due, and on the day.</p>
</div>
${shot('schedule', 'The car page: a maintenance schedule with overdue and upcoming items by mileage.')}
</div>
<div class="moment">
<div class="copy">
<p class="quote">"Is that noise a known problem?"</p>
<h2>Ask anything. Get answers you can check.</h2>
<p>Ask about your car in plain English. Answers come from your car's schedule, your service log and federal safety data from NHTSA, and every answer shows its sources. When it doesn't know, it says so.</p>
</div>
${shot('ask', 'Ask: questions about recalls and the next oil change, answered with source chips under each answer.')}
</div>
<div class="moment">
<div class="copy">
<p class="quote">"Am I being taken?"</p>
<h2>Walk into the shop knowing more.</h2>
<p>Photograph a shop's quote and see which items your car's schedule calls for, which you had done recently, and which match a recall.</p>
</div>
${shot('quote', 'A checked quote: three of seven lines are not needed now, with the reason for each line.')}
</div>
</section>

<section class="band surface"><div class="wrap">
<p class="eyebrow">Everything in the app today</p>
<h2>On your side, and out of your way.</h2>
<div class="pillars">
<div class="card"><h3>Knows your car</h3><ul>
<li>What's due: your car's maintenance schedule, replanned from your odometer.</li>
<li>Recalls for your model, straight from NHTSA, with a link to check your own VIN.</li>
<li>Known problems: what other owners of the same model year report, grouped by part.</li>
</ul></div>
<div class="card"><h3>Answers you can check</h3><ul>
<li>Ask anything: "What's due next?", "Is that noise a known problem?"</li>
<li>Every answer shows the records it came from.</li>
<li>Check a shop's quote against your schedule and service history.</li>
</ul></div>
<div class="card"><h3>On your side</h3><ul>
<li>No partner shops, no dealer, nothing to plug in.</li>
<li>Your own work counts. DIY or shop, it all goes in the service log.</li>
<li>Receipts, registration and insurance kept with the car they belong to.</li>
<li>Warranty coverage, and a proof-of-care PDF to share when you sell.</li>
</ul></div>
<div class="card"><h3>Out of your way</h3><ul>
<li>Every car in your household in one garage.</li>
<li>Fill-ups and charging, with fuel economy and running costs.</li>
<li>Works offline, and syncs when there's signal.</li>
<li>Export everything as open CSV and JSON files, with your photos, any time.</li>
</ul></div>
</div>
</div></section>

<section class="wrap cta">
<h2>Stop guessing what your car needs.</h2>
<p>${name} is coming to the App Store for iPhone in the United States.</p>
<div class="actions"><a class="pill secondary" href="${href('support/')}">Questions? Get in touch</a></div>
</section>

<section class="wrap"><p class="fine">Schedules are a general maintenance baseline for your type of car until manufacturer data is added; your owner's manual has the exact intervals. Recall data covers your model and year; use NHTSA's link to check your own VIN. Ask explains your car's records. It is not a mechanic and cannot inspect your car. For anything about safety, have the car checked by a professional.</p></section>`,
  })

  const effective = effectiveDate(input.policyMarkdown)
  const privacy = shell({
    page: 'privacy',
    path: 'privacy/',
    title: `Privacy policy · ${input.appName}`,
    description: `What ${input.appName} collects, why, who else handles it, and your choices.${effective ? ` Effective ${effective}.` : ''}`,
    body: `<article class="wrap narrow doc">
${renderPolicy(input.policyMarkdown)}
</article>`,
  })

  const faq: [question: string, answer: string][] = [
    [
      'How do I sign in?',
      "Enter any email address you can read. The app emails you a six-digit code, and the first sign-in creates your account. There's no password to remember.",
    ],
    [
      'How do I add my car?',
      'Tap + in the garage and enter the VIN, or choose the year, make and model. The VIN is on your registration, your insurance card, and the driver-side dashboard where it meets the windshield.',
    ],
    [
      "Why doesn't the schedule match my owner's manual?",
      "For now the schedule is a general maintenance baseline for your type of car, not your manufacturer's own. Your owner's manual has the exact intervals; when they differ, follow the manual.",
    ],
    [
      'Does a recall in the app mean my car is affected?',
      `Recalls are listed for your car's make, model and year. Not every car of that model is included, so use the NHTSA link on the recall, or <a href="https://www.nhtsa.gov/recalls">nhtsa.gov/recalls</a>, to check your own VIN. Recall repairs are free at the dealer.`,
    ],
    [
      'What does Ask share, and can I turn it off?',
      `Ask and the quote checker use Claude, an AI model made by Anthropic. Before either sends anything, the app shows what will be sent and asks you first. Turn it off any time in Account → Privacy; the rest of the app keeps working. The <a href="${href('privacy/')}">privacy policy</a> has the details.`,
    ],
    [
      'Does it work without signal?',
      'Yes. Your garage, history and reminders live on your phone and sync when you are back online. Ask, the quote checker and fresh recall data need a connection.',
    ],
    [
      'How do I get my data out?',
      'Account → Export or import data saves a zip with everything, as open CSV and JSON files and your original photos and documents. You can import it again later.',
    ],
    [
      'How do I delete my account?',
      'Account → Delete account deletes your account and everything stored for it. To fix a service record or a car you entered by mistake, email us and we will sort it out.',
    ],
  ]

  const support = shell({
    page: 'support',
    path: 'support/',
    title: `Support · ${input.appName}`,
    description: `Get help with ${input.appName}: contact us, and answers to common questions.`,
    body: `<article class="wrap narrow doc">
<h1>Support</h1>
<p class="lede">Something not working, a question about your car's data, or a privacy request?</p>
<div class="card contact">
<div><h2>Email us</h2><p>${mailto}</p></div>
${email ? `<a class="pill primary" href="mailto:${escape(email)}?subject=${encodeURIComponent(`${input.appName} support`)}">Write to us</a>` : ''}
</div>
<p class="small">It helps to say which iPhone and iOS version you have, and the year, make and model of the car. Please don't send your full VIN unless we ask.</p>
<h2>Common questions</h2>
<div class="faq">
${faq.map(([q, a]) => `<details><summary>${escape(q)}</summary><p>${a}</p></details>`).join('\n')}
</div>
</article>`,
  })

  const missing = shell({
    page: 'missing',
    path: '404.html',
    title: `Page not found · ${input.appName}`,
    description: 'This page does not exist.',
    body: `<section class="wrap missing">
<h1>Nothing here.</h1>
<p class="lede">That page doesn't exist. Try the <a href="${href('')}">home page</a> or <a href="${href('support/')}">support</a>.</p>
</section>`,
  })

  return {
    files: {
      'index.html': home,
      'privacy/index.html': privacy,
      'support/index.html': support,
      '404.html': missing,
      'theme.css': themeCss(input.light, input.dark),
      'styles.css': input.styles,
      'robots.txt': `User-agent: *\nAllow: /\nSitemap: ${input.siteUrl}/sitemap.xml\n`,
      'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', 'privacy/', 'support/'].map((p) => `<url><loc>${input.siteUrl}/${p}</loc></url>`).join('\n')}
</urlset>
`,
    },
    placeholders: findPlaceholders(input.policyMarkdown),
  }
}
