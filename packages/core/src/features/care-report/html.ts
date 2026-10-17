import type { CoverageState } from '../warranty/coverage'
import type { CareReport, CareStatus } from './report'

/**
 * The colours a printed report uses, by role. The app passes its light theme, since the report
 * is read on white paper or a white PDF page whatever the phone's appearance.
 */
export interface ReportColors {
  text: string
  textSecondary: string
  accent: string
  separator: string
  warning: string
  /** Behind the summary figures. */
  subtle: string
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes text for HTML; everything in a report is owner-typed and must not become markup. */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

const e = escapeHtml
const cell = (text: string | undefined) => `<td>${text === undefined ? '' : e(text)}</td>`

const STATUS_CLASS: Record<CareStatus, string> = {
  'on-schedule': 'ok',
  late: 'attention',
  overdue: 'attention',
  'not-logged': 'quiet',
}

const COVERAGE_CLASS: Record<CoverageState, string> = {
  active: 'ok',
  'ending-soon': 'attention',
  ended: 'quiet',
}

const warrantiesSection = (report: CareReport) => {
  if (report.warranties.length === 0) return ''
  const rows = report.warranties
    .map(
      (w) => `<tr>
  <td><strong>${e(w.coverage)}</strong>${w.provider ? `<div class="quiet">${e(w.provider)}</div>` : ''}</td>
  ${cell(w.term)}
  <td class="${COVERAGE_CLASS[w.state]}">${e(w.status)}</td>
  ${cell(w.policyNumber)}
</tr>`,
    )
    .join('\n')
  return `<h2>Warranties</h2>
<table>
<thead><tr><th>Coverage</th><th>Term</th><th>Status</th><th>Policy</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`
}

const scheduleSection = (report: CareReport) => {
  if (report.schedule.length === 0) return ''
  const rows = report.schedule
    .map(
      (s) => `<tr>
  <td><strong>${e(s.task)}</strong><div class="quiet">${e(s.interval)}</div></td>
  <td class="num">${s.times}</td>
  ${cell(s.lastDone)}
  <td class="${STATUS_CLASS[s.status]}">${e(s.statusLabel)}</td>
</tr>`,
    )
    .join('\n')
  return `<h2>Maintenance against the schedule</h2>
<p class="quiet">${e(report.scheduleTitle)}.${report.scheduleNote ? ` ${e(report.scheduleNote)}` : ''}</p>
<table>
<thead><tr><th>Item</th><th class="num">Times</th><th>Last done</th><th>Status</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`
}

const historySection = (report: CareReport) => {
  if (report.history.length === 0)
    return `<h2>Service history</h2>\n<p class="quiet">No services logged yet.</p>`
  const rows = report.history
    .map(
      (h) => `<tr>
  ${cell(h.date)}
  <td class="num">${h.miles === undefined ? '' : e(h.miles)}</td>
  <td><strong>${e(h.what)}</strong>${h.notes ? `<div class="quiet">${e(h.notes)}</div>` : ''}</td>
  <td>${e(h.by)}${h.diy ? ' <span class="tag">DIY</span>' : ''}</td>
  <td class="num">${h.cost === undefined ? '' : e(h.cost)}</td>
</tr>`,
    )
    .join('\n')
  return `<h2>Service history</h2>
<table>
<thead><tr><th>Date</th><th class="num">Odometer</th><th>Work</th><th>Done by</th><th class="num">Cost</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`
}

/**
 * Lays out a care report as a self-contained HTML page sized for US Letter, for printing to PDF.
 * Every value is escaped.
 */
export const renderCareReportHtml = (report: CareReport, colors: ReportColors): string => {
  const { summary } = report
  const facts = [
    report.vin ? `VIN ${report.vin}` : undefined,
    report.odometer ? `Odometer: ${report.odometer}` : undefined,
  ]
    .filter((f): f is string => f !== undefined)
    .map(e)
    .join(' &middot; ')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(report.fileName)}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.4 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: ${colors.text}; }
  h1 { font-size: 22pt; margin: 0; }
  h2 { font-size: 13pt; margin: 22pt 0 6pt; color: ${colors.accent}; break-after: avoid; }
  .overline { font-size: 8.5pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${colors.textSecondary}; }
  .quiet { color: ${colors.textSecondary}; font-weight: 400; }
  .ok { color: ${colors.accent}; font-weight: 600; }
  .attention { color: ${colors.warning}; font-weight: 600; }
  .summary { display: flex; gap: 8pt; margin-top: 14pt; }
  .figure { flex: 1; background: ${colors.subtle}; border-radius: 8pt; padding: 8pt 10pt; }
  .figure b { display: block; font-size: 15pt; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: ${colors.textSecondary}; padding: 4pt 6pt; border-bottom: 1pt solid ${colors.separator}; }
  td { padding: 6pt; vertical-align: top; border-bottom: 0.5pt solid ${colors.separator}; }
  tr { break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .tag { font-size: 7.5pt; font-weight: 700; color: ${colors.accent}; border: 0.75pt solid ${colors.accent}; border-radius: 4pt; padding: 0 3pt; }
  @media screen { body { max-width: 7.3in; margin: 0.6in auto; padding: 0 16px; } }
  footer { margin-top: 24pt; font-size: 8.5pt; color: ${colors.textSecondary}; }
</style>
</head>
<body>
<div class="overline">Proof of care &middot; prepared ${e(report.preparedOn)}</div>
<h1>${e(report.title)}</h1>
${report.subtitle ? `<div class="quiet">${e(report.subtitle)}</div>` : ''}
${facts ? `<div class="quiet">${facts}</div>` : ''}
<div class="summary">
  <div class="figure"><span class="quiet">Services logged</span><b>${summary.services}</b></div>
  <div class="figure"><span class="quiet">Done by the owner</span><b>${summary.diy}</b></div>
  <div class="figure"><span class="quiet">Spent on maintenance</span><b>${e(summary.spent)}</b></div>
</div>
${summary.span ? `<p class="quiet">Records from ${e(summary.span)}.</p>` : ''}
${warrantiesSection(report)}
${scheduleSection(report)}
${historySection(report)}
<footer>Records entered by the owner. Work done by the owner is listed as DIY; keep receipts for parts and fluids to support a warranty claim.</footer>
</body>
</html>
`
}
