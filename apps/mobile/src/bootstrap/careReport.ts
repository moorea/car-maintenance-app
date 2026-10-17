import { renderCareReportHtml, type CareReportExporter } from '@car/core'
import { File, Paths } from 'expo-file-system'
import { printToFileAsync } from 'expo-print'
import { shareAsync } from 'expo-sharing'
import { reportColors } from '../theme'

/** US Letter in points, with the 0.6 inch margins the report's own page style asks for. */
const LETTER = { width: 612, height: 792 }
const MARGIN = 43

/**
 * Prints the report to a PDF on the phone and opens the share sheet with it, so the owner can
 * mail it to a dealer, save it to Files or AirDrop it to a buyer. Works offline.
 */
export const pdfReportExporter = (): CareReportExporter => ({
  share: async (report) => {
    const printed = await printToFileAsync({
      html: renderCareReportHtml(report, reportColors),
      ...LETTER,
      // iOS ignores the page margins in CSS and takes these instead.
      margins: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    })
    // The printer picks a random file name; whoever receives the PDF should see what it is.
    const named = new File(Paths.cache, `${report.fileName}.pdf`)
    if (named.exists) named.delete()
    await new File(printed.uri).move(named)
    await shareAsync(named.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: report.fileName,
    })
  },
})
