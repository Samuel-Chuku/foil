import { bankFromNipCode, bankFromText } from './banks'
import { parseMoney } from './money'
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
export function clean(text: string): string {
  const t = text.trim()
  return /^(n\/?a|none|null|nil|unknown|absent|empty|not (shown|available|found|given|stated|provided|mentioned|specified)|-+)$/i.test(
    t,
  )
    ? ''
    : t
}

// Status words in English and Portuguese. A scheduled Pix ("agendado") looks
// like a finished payment but has not happened, a known trick, so it counts
// as pending. Failure is checked first so "não concluído" is not a success.
function status(text: string): Receipt['status'] {
  const t = text.toLowerCase()
  if (
    /fail|declin|revers|unsuccess|falh|recusad|cancelad|estornad|não conclu|nao conclu/.test(
      t,
    )
  )
    return 'failed'
  if (/pend|process|queue|initiat|agendad|em análise|em analise/.test(t))
    return 'pending'
  if (
    /success|complet|approved|paid|conclu|aprovad|realizad|efetuad|enviado/.test(
      t,
    )
  )
    return 'successful'
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
    amountKobo: parseMoney(clean(raw.amountText)),
    sender: clean(raw.sender),
    senderBank: bank?.id ?? null,
    reference,
    at,
    status: status(clean(raw.statusText)),
  }
}
