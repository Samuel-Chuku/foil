import type { RawReceipt } from './receiptFields'

// Value after a label on the same line ("Sender Name:   ADA OBI") or, when the
// label stands alone, on the next line.
function labelled(lines: string[], labels: string[]): string {
  for (const label of labels) {
    // (?!\\w) stops a short label such as "To" matching "Total".
    const re = new RegExp(`^${label}(?!\\w)\\s*:?\\s*(.*)$`, 'i')
    for (const [i, line] of lines.entries()) {
      const m = re.exec(line)
      if (!m) continue
      const value = m[1]!.trim()
      if (value) return value
      const next = lines[i + 1]?.trim()
      if (next) return next
    }
  }
  return ''
}

// PDF receipts carry a clean text layer, so rules read them exactly and at
// once. Returns null when the layout is not recognised, and the model reads it.
export function parsePdfReceiptText(text: string): RawReceipt | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const amountText = /(?:₦|NGN)\s*[\d,]+(?:\.\d{1,2})?/.exec(text)?.[0] ?? ''
  const sender = labelled(lines, [
    'Sender Name',
    'Sender',
    'From',
    'Debit Account',
  ])
  if (!amountText || !sender) return null
  return {
    issuer: '',
    amountText,
    statusText:
      lines.find((l) => /^(success\w*|pending|failed|successful)\b/i.test(l)) ??
      '',
    sender,
    recipient: labelled(lines, [
      'Beneficiary Name',
      'Beneficiary',
      'Recipient',
      'To',
    ]),
    sessionId: /\b\d{30}\b/.exec(text)?.[0] ?? labelled(lines, ['Session ?ID']),
    reference: labelled(lines, [
      'Transaction Reference',
      'Reference',
      'Transaction ID',
    ]),
    dateTime:
      labelled(lines, ['Transaction Date', 'Date and Time', 'Date']) ||
      (lines.find((l) => /\b20\d\d\b.*\d{1,2}:\d{2}/.test(l)) ?? ''),
  }
}
