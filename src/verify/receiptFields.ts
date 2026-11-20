import { bankFromNipCode, bankFromText } from './banks'
import { parseNairaKobo } from './money'
import { decodeSessionId } from './sessionId'
import { parseLagosStamp } from './time'
import type { Receipt, VerifyConfig } from './types'

// What the model is asked to copy off a receipt. Every field is text exactly as
// printed; the model never computes or judges anything.
export type RawReceipt = {
  issuer: string
  amountText: string
  statusText: string
  sender: string
  recipient: string
  sessionId: string
  reference: string
  dateTime: string
}

export const RAW_RECEIPT_FIELDS: readonly (keyof RawReceipt)[] = [
  'issuer',
  'amountText',
  'statusText',
  'sender',
  'recipient',
  'sessionId',
  'reference',
  'dateTime',
]

// Models fill absent fields with placeholders instead of leaving them empty.
function clean(text: string): string {
  const t = text.trim()
  return /^(n\/?a|none|null|nil|not (shown|available|found)|-+)$/i.test(t)
    ? ''
    : t
}

function status(text: string): Receipt['status'] {
  const t = text.toLowerCase()
  if (/fail|declin|revers|unsuccess/.test(t)) return 'failed'
  if (/pend|process|queue|initiat/.test(t)) return 'pending'
  if (/success|complet|approved|paid/.test(t)) return 'successful'
  return 'unknown'
}

export function toReceipt(raw: RawReceipt, config: VerifyConfig): Receipt {
  const reference = `${clean(raw.sessionId)} ${clean(raw.reference)}`.trim()
  const session = decodeSessionId(reference)
  // A receipt is produced by the payer's own app, so its header names the
  // sender's bank. With no header, the session ID's bank code is the fallback.
  const bank =
    bankFromText(config.banks, clean(raw.issuer)) ??
    (session.ok ? bankFromNipCode(config.banks, session.value.nipCode) : null)
  let at = parseLagosStamp(clean(raw.dateTime))
  // Some PDF receipts print every time as 00:00:00, which means "date only".
  if (at && at.precision === 'second' && at.ms % 86_400_000 === 0) {
    at = { ms: at.ms, precision: 'day' }
  }
  return {
    amountKobo: parseNairaKobo(clean(raw.amountText)),
    sender: clean(raw.sender),
    senderBank: bank?.id ?? null,
    reference,
    at,
    status: status(clean(raw.statusText)),
  }
}
