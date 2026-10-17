import { renderCareReportHtml, type CareReportExporter } from '@car/core'
import { reportColors } from '../theme'

/** The web preview opens the report in a new tab, where the browser can print it to PDF. */
export const pdfReportExporter = (): CareReportExporter => ({
  share: async (report) => {
    const html = renderCareReportHtml(report, reportColors)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const opened = window.open(url, '_blank')
    if (!opened) {
      URL.revokeObjectURL(url)
      throw new Error('Allow pop-ups for this site to open the report')
    }
    // The new tab has read the page well before this; a URL never revoked lives until reload.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
})
