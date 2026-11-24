import { bankFromSender } from './banks'
import { parseMoney } from './money'
import { decodeSessionId } from './sessionId'
import { parseShopStamp } from './time'
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
  // A bank's other mail: login notices, offers, statements.
  | { status: 'not-a-transfer'; bank: string }

type Parsed = Pick<
  Credit,
  'direction' | 'amountKobo' | 'sender' | 'narration' | 'reference'
> & { time?: string | null }

const AMOUNT = String.raw`(?:NGN|₦|N)?\s*[\d,]+(?:\.\d{1,2})?`

// Reads "Label: value" or "Label    value". Some banks put the value on the
// next line instead, which `nextLine` allows.
function field(body: string, label: string, nextLine = false): string | null {
  const m = new RegExp(
    `^[ \\t]*${label}(?!\\w)[ \\t]*:?[ \\t]*(.*)$`,
    'im',
  ).exec(body)
  if (!m) return null
  const value = m[1]!.trim()
  if (value || !nextLine) return value || null
  return (
    body
      .slice(m.index + m[0].length)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && l !== ':') ?? null
  )
}

function direction(text: string | null | undefined): 'credit' | 'debit' | null {
  if (!text) return null
  if (/\bcredit(ed)?\b/i.test(text)) return 'credit'
  if (/\bdebit(ed)?\b/i.test(text)) return 'debit'
  return null
}

function money(text: string | null | undefined): number | null {
  return text ? parseMoney(text) : null
}

function parsed(p: {
  direction: 'credit' | 'debit' | null
  amountKobo: number | null
  sender: string | null
  narration: string
  reference?: string | null
  time?: string | null
}): Parsed | null {
  if (!p.direction || p.amountKobo === null) return null
  return {
    direction: p.direction,
    amountKobo: p.amountKobo,
    sender: p.sender?.trim() ?? '',
    narration: p.narration.trim(),
    reference: p.reference ?? null,
    time: p.time ?? null,
  }
}

// For banks without a parser of their own, the common wording of their
// rail's credit alerts: Indian bank alerts name the UPI reference, Brazilian
// ones the Pix end-to-end ID. Anything else goes to the on-device model.
const RAIL_PARSERS: Partial<
  Record<VerifyConfig['rail'], (body: string) => Parsed | null>
> = {
  upi(body) {
    const flat = body.replace(/\s+/g, ' ')
    const ref =
      /UPI\s*(?:Ref(?:erence)?\.?\s*(?:No\.?|Number)?|transaction ID)\s*:?\s*(\d{12})/i.exec(
        flat,
      )
    const amount = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(flat)
    const dir = /\bcredited\b/i.test(flat)
      ? 'credit'
      : /\bdebited\b/i.test(flat)
        ? 'debit'
        : null
    const who =
      /\((?![^)]*\d{6})([A-Za-z][A-Za-z .']{1,60})\)/.exec(flat)?.[1] ??
      /\b(?:from|by|to)\s+(?:VPA\s+)?(\S+@\S+)/i.exec(flat)?.[1] ??
      null
    return parsed({
      direction: dir,
      amountKobo: amount ? money(amount[1]!) : null,
      sender: who,
      narration: flat,
      reference: ref?.[1] ?? null,
      time:
        /\d{1,2}[/.-]\d{1,2}[/.-]20\d\d(?:[ ,]+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?)?/.exec(
          flat,
        )?.[0] ?? null,
    })
  },
  pix(body) {
    const flat = body.replace(/\s+/g, ' ')
    const amount = /R\$\s*([\d.]+,\d{2}|[\d.]+)/.exec(flat)
    const dir = /\b(recebeu|recebido|recebida)\b/i.test(flat)
      ? 'credit'
      : /\b(enviou|enviado|enviada|pagou)\b/i.test(flat)
        ? 'debit'
        : null
    const who =
      /\b(?:de|para)\s+([A-ZÀ-Ú][A-ZÀ-Ú' ]{2,60}?)(?=\s+(?:em|no dia|às)\b|[.,])/.exec(
        flat,
      )?.[1] ?? null
    const date =
      /(\d{1,2}\/\d{1,2}\/20\d\d)(?:\s*(?:às|as)\s*(\d{1,2}:\d{2}))?/i.exec(
        flat,
      )
    return parsed({
      direction: dir,
      amountKobo: amount ? money(amount[1]!) : null,
      sender: who,
      narration: flat,
      reference:
        /\bE[0-9A-Z]{8}\d{12}[A-Za-z0-9]{11}\b/.exec(flat)?.[0] ?? null,
      time: date ? `${date[1]} ${date[2] ?? ''}`.trim() : null,
    })
  },
}

// One parser per bank layout. A parser returns null when the email is not a
// layout it knows, and the on-device model reads it instead.
const PARSERS: Record<string, (body: string) => Parsed | null> = {
  gtbank(body) {
    const desc = field(body, 'Description') ?? ''
    return parsed({
      direction: direction(/a (\w+) transaction occurred/i.exec(body)?.[1]),
      amountKobo: money(field(body, 'Amount')),
      // The description starts with the session ID, then the counterparty.
      sender: desc.replace(/^\d{20,}[\s-]*/, ''),
      narration: `${desc} ${field(body, 'Remarks') ?? ''}`,
      reference: field(body, 'Document Number'),
    })
  },
  access(body) {
    const m = new RegExp(
      `account has been (credited|debited)\\s+(${AMOUNT})`,
      'i',
    ).exec(body)
    const desc = field(body, 'Description') ?? ''
    return parsed({
      direction: direction(m?.[1]),
      amountKobo: money(m?.[2]),
      // "<sender>/<narration>"
      sender: desc.split('/')[0] ?? '',
      narration: desc,
      reference: field(body, 'Reference Number'),
    })
  },
  kuda(body) {
    const credit = new RegExp(
      `^\\s*(.+?) just sent you (${AMOUNT})`,
      'im',
    ).exec(body)
    const debit = new RegExp(
      `You just sent (${AMOUNT}) to (.+?)\\.?\\s*$`,
      'im',
    ).exec(body)
    if (credit) {
      return parsed({
        direction: 'credit',
        amountKobo: money(credit[2]),
        sender: credit[1]!,
        narration: credit[0],
      })
    }
    return parsed({
      direction: debit ? 'debit' : null,
      amountKobo: money(debit?.[1]),
      sender: debit?.[2] ?? '',
      narration: debit?.[0] ?? '',
    })
  },
  providus(body) {
    const narr = field(body, 'Narrative') ?? ''
    return parsed({
      direction: direction(/that a (\w+) transaction/i.exec(body)?.[1]),
      amountKobo: money(field(body, 'Amount')),
      // "INWARD TRANSFER(H) FROM <BANK>/ <SENDER>-<SENDER><ACCOUNT>/<SESSION ID>"
      sender: /FROM [^/]*\/\s*([^-/]+)/i.exec(narr)?.[1] ?? narr,
      narration: narr,
      reference: field(body, 'Reference'),
      time: field(body, 'Time'),
    })
  },
  zenith(body) {
    const desc = field(body, 'Description') ?? ''
    const parts = desc.split('/')
    return parsed({
      direction: direction(field(body, 'Transaction Type')),
      amountKobo: money(field(body, 'Amount')),
      // "CIP CR/ <SENDER>/<narration>"; a plain description has no code part.
      sender: parts.length >= 3 ? parts[1]! : parts[0]!,
      narration: desc,
      reference: field(body, 'Reference Code'),
    })
  },
  uba(body) {
    const narr = field(body, 'Transaction Narration') ?? ''
    return parsed({
      direction: direction(field(body, 'Transaction Type')),
      amountKobo: money(field(body, 'Transaction Amount')),
      sender: narr,
      narration: `${narr} ${field(body, 'Transaction Remarks') ?? ''}`,
      time: field(body, 'Date and Time'),
    })
  },
  opay(body) {
    // Only OPay's debit layout is known so far; credits go to the model.
    const m = new RegExp(
      `Your transfer of (${AMOUNT}) is successful`,
      'i',
    ).exec(body)
    return parsed({
      direction: m ? 'debit' : null,
      amountKobo: money(m?.[1]),
      sender: field(body, 'Name'),
      narration: `${field(body, 'Name') ?? ''} ${field(body, 'Bank') ?? ''}`,
      reference: field(body, 'Transaction No\\.'),
      time: field(body, 'Transaction Date'),
    })
  },
  palmpay(body) {
    const credit = new RegExp(`received a transfer of (${AMOUNT})`, 'i').exec(
      body,
    )
    const debit = new RegExp(`Your transfer of (${AMOUNT}) has been`, 'i').exec(
      body,
    )
    const session = field(body, 'Session ID') ?? ''
    return parsed({
      direction: credit ? 'credit' : debit ? 'debit' : null,
      amountKobo: money((credit ?? debit)?.[1]),
      sender: credit ? field(body, 'Sender') : field(body, 'Recipient Name'),
      narration: `${field(body, 'Remark') ?? ''} ${session}`,
      reference: field(body, 'Transaction ID'),
      time: credit ? field(body, 'Date/Time') : field(body, 'Completion Time'),
    })
  },
  moniepoint(body) {
    const dir = direction(/a (\w+) transaction occurred/i.exec(body)?.[1])
    return parsed({
      direction: dir,
      amountKobo: money(field(body, '(?:Credit|Debit) Amount', true)),
      sender: (field(body, "Sender's Name:?", true) ?? '').replace(
        /^from\s+/i,
        '',
      ),
      narration: field(body, 'Narration:?', true) ?? '',
      time: field(body, 'Date & Time:?', true),
    })
  },
}

// Banks send login notices and offers from the same address as alerts. Mail
// with no credit or debit and no amount is not a transfer the rules missed.
export function looksLikeTransfer(body: string): boolean {
  return (
    /\b(credit(ed)?|debit(ed)?|transfer(red)?|received)\b/i.test(body) &&
    /(?:NGN|₦|\bN)\s?\d[\d,]*(?:\.\d{1,2})?/i.test(body)
  )
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
  const p = (PARSERS[bank.id] ?? RAIL_PARSERS[config.rail])?.(email.body)
  if (!p) {
    return looksLikeTransfer(email.body)
      ? { status: 'unknown-format', bank: bank.id }
      : { status: 'not-a-transfer', bank: bank.id }
  }
  const session = decodeSessionId(p.narration)
  const written = p.time ? parseShopStamp(p.time) : null
  return {
    status: 'parsed',
    credit: {
      id: email.id,
      bank: bank.id,
      direction: p.direction,
      reversal: /\b(reversal|rvsl|reversed)\b/i.test(p.narration),
      amountKobo: p.amountKobo,
      sender: p.sender,
      narration: p.narration,
      sessionId: session.ok ? session.value.digits : null,
      reference: p.reference,
      // Some alerts carry only a date or a garbled time; the email's arrival
      // time is precise and lands within minutes of the credit.
      at:
        written && written.precision !== 'day'
          ? written
          : { ms: email.receivedAt, precision: 'second' },
      source: 'alert',
      strength: 'alert received',
    },
  }
}
