import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

// Receipts are one or two pages; a long statement is cut short so the text
// stays well inside the on-device request limit.
const MAX_PAGES = 2

export async function pdfText(data: ArrayBuffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  try {
    const pages: string[] = []
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      // Items on one printed line share a y position; join those with spaces.
      let lastY: number | null = null
      let line = ''
      const lines: string[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        const y = item.transform[5] as number
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push(line.trim())
          line = ''
        }
        line += `${item.str} `
        lastY = y
      }
      lines.push(line.trim())
      pages.push(lines.filter(Boolean).join('\n'))
    }
    return pages.join('\n\n')
  } finally {
    await task.destroy()
  }
}
