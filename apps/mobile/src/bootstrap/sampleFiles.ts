/**
 * Pictures of a sample insurance card, registration and receipt for the web preview, as browser
 * object URLs. They are file contents, drawn in plain black and white, not app colours.
 */
const card = (title: string, lines: string[]) => {
  const rows = lines
    .map((line, i) => `<text x="40" y="${150 + i * 44}" font-size="26">${line}</text>`)
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${220 + lines.length * 44}" font-family="Helvetica, Arial, sans-serif">
<rect width="100%" height="100%" fill="white" stroke="black" stroke-width="4"/>
<text x="40" y="80" font-size="38" font-weight="bold">${title}</text>
<line x1="40" y1="104" x2="760" y2="104" stroke="black" stroke-width="2"/>${rows}</svg>`
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
}

export const sampleFiles = (): Record<string, string> => ({
  'demo-insurance': card('SAMPLE Insurance ID card', [
    'Policy 000-0000000-00',
    'Effective 09/01/2026 to 03/01/2027',
    '2021 Toyota RAV4 XLE',
    'Not a real policy',
  ]),
  'demo-registration': card('SAMPLE Vehicle registration', [
    '2021 Toyota RAV4 · Plate DEMO123',
    'Expires 03/31/2027',
    'Not a real registration',
  ]),
  'demo-receipt': card('Demo Garage · Receipt', [
    'Jul 1, 2026 · 30,000 mi',
    'Oil & filter change ........ $89.95',
    'Total ........................ $89.95',
  ]),
})
