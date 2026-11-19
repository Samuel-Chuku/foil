import { bankFromSender } from './banks'
import { parseNairaKobo } from './money'
import { decodeSessionId } from './sessionId'
import { parseLagosStamp } from './time'
import type { Credit, LagosMs, VerifyConfig } from './types'

export type AlertEmail = {
  id: string
  from: string
  body: string
  receivedAt: LagosMs
  inSpam: boolean
}

export type AlertResult =
  | { status: 'parsed'; credit: Credit }
  | { status: 'untrusted'; reason: string }
  // A trusted bank sent a format the rules do not know; the model reads it.
  | { status: 'unknown-format'; bank: string }

type Parsed = Pick<
  Credit,
  'direction' | 'amountKobo' | 'sender' | 'narration' | 'reference'
> & { time?: string }

function field(body: string, label: string): string | null {
  const m = new RegExp(`^[ \\t]*${label}[ \\t]*:?[ \\t]+(.+)$`, 'im').exec(body)
  return m ? m[1]!.trim() : null
}

function direction(text: string): 'credit' | 'debit' | null {
  if (/\bcredit(ed)?\b/i.test(text)) return 'credit'
  if (/\bdebit(ed)?\b/i.test(text)) return 'debit'
  return null
}

const PARSERS: Record<string, (body: string) => Parsed | null> = {
  gtbank(body) {
    const dir = direction(/a (\w+) transaction occurred/i.exec(body)?.[1] ?? '')
    const amount = parseNairaKobo(field(body, 'Amount\\s*:') ?? '')
    const desc = field(body, 'Description\\s*:') ?? ''
    if (!dir || amount === null) return null
    // The description is "<session ID>-<sender and narration>".
    const sender = desc.replace(/^\d{20,}\s*-\s*/, '')
    return {
      direction: dir,
      amountKobo: amount,
      sender,
      narration: `${desc} ${field(body, 'Remarks\\s*:') ?? ''}`.trim(),
      reference: field(body, 'Document Number\\s*:'),
    }
  },
  access(body) {
    const m =
      /account has been (credited|debited)\s+(NGN\s*[\d,]+(?:\.\d{1,2})?)/i.exec(
        body,
      )
    if (!m) return null
    const amount = parseNairaKobo(m[2]!)
    const desc = field(body, 'Description') ?? ''
    if (amount === null) return null
    // The description is "<sender>/<narration>".
    return {
      direction: direction(m[1]!)!,
      amountKobo: amount,
      sender: desc.split('/')[0]!.trim(),
      narration: desc,
      reference: field(body, 'Reference Number'),
    }
  },
  kuda(body) {
    const m = /^\s*(.+?) just sent you (₦\s*[\d,]+(?:\.\d{1,2})?)/im.exec(body)
    if (!m) return null
    const amount = parseNairaKobo(m[2]!)
    if (amount === null) return null
    return {
      direction: 'credit',
      amountKobo: amount,
      sender: m[1]!.trim(),
      narration: m[0].trim(),
      reference: null,
    }
  },
  providus(body) {
    const dir = direction(/that a (\w+) transaction/i.exec(body)?.[1] ?? '')
    const amount = parseNairaKobo(field(body, 'Amount') ?? '')
    const narr = field(body, 'Narrative') ?? ''
    if (!dir || amount === null) return null
    // "INWARD TRANSFER(H) FROM <BANK>/ <SENDER>-<SENDER><ACCOUNT>/<SESSION ID>"
    const sender = /FROM [^/]*\/\s*([^-/]+)/i.exec(narr)?.[1]?.trim() ?? narr
    return {
      direction: dir,
      amountKobo: amount,
      sender,
      narration: narr,
      reference: field(body, 'Reference'),
      time: field(body, 'Time') ?? undefined,
    }
  },
}

export function parseAlert(
  email: AlertEmail,
  config: VerifyConfig,
): AlertResult {
  if (email.inSpam) {
    return { status: 'untrusted', reason: 'It is in the spam folder.' }
  }
  const bank = bankFromSender(config.banks, email.from)
  if (!bank) {
    return {
      status: 'untrusted',
      reason: `${email.from} is not a known bank alert address.`,
    }
  }
  const parsed = PARSERS[bank.id]?.(email.body)
  if (!parsed) return { status: 'unknown-format', bank: bank.id }
  const session = decodeSessionId(parsed.narration)
  const written = parsed.time ? parseLagosStamp(parsed.time) : null
  return {
    status: 'parsed',
    credit: {
      id: email.id,
      bank: bank.id,
      direction: parsed.direction,
      reversal: /\b(reversal|rvsl|reversed)\b/i.test(parsed.narration),
      amountKobo: parsed.amountKobo,
      sender: parsed.sender,
      narration: parsed.narration,
      sessionId: session.ok ? session.value.digits : null,
      reference: parsed.reference,
      // Some alerts carry only a date or a garbled time; the email's arrival
      // time is precise and lands within moments of the credit.
      at:
        written && written.precision !== 'day'
          ? written
          : { ms: email.receivedAt, precision: 'second' },
      source: 'alert',
      strength: 'alert received',
    },
  }
}
