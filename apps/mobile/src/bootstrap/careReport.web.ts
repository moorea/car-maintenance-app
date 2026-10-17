import { renderCareReportHtml, type CareReportExporter } from '@car/core'
import { reportColors } from '../theme'

/** The web preview opens the report in a new tab, where the browser can print it to PDF. */
export const pdfReportExporter = (): CareReportExporter => ({
  share: async (report) => {
    const html = renderCareReportHtml(report, reportColors)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    window.open(url, '_blank')
  },
})
