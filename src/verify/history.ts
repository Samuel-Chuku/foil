import { clean } from './receiptFields'
import { parseNairaKobo } from './money'
import { decodeSessionId, digitRuns, prefixOf } from './sessionId'
import { parseLagosStamp } from './time'
import type { Credit, LagosMs, Stamp } from './types'

// What the model copies off each row of a bank app's transaction history, as
// printed. Code decides direction, amount and time.
export type RawHistoryRow = {
  amountText: string
  direction: string
  description: string
  dateTime: string
}

export const RAW_HISTORY_FIELDS: readonly (keyof RawHistoryRow)[] = [
  'amountText',
  'direction',
  'description',
  'dateTime',
]

// The start of a session ID (bank code and the time to the minute) is enough
// to tie a history row to one transfer.
const PREFIX_DIGITS = 16

// History rows usually show a truncated session ID instead of the payer's
// name. Returns the leading digits shown, if long enough to mean anything.
export function sessionPrefix(text: string): string | null {
  const run = digitRuns(text)
    .filter((r) => r.length >= PREFIX_DIGITS && r.length < 30)
    .sort((a, b) => b.length - a.length)[0]
  return run ?? null
}

function direction(row: RawHistoryRow): Credit['direction'] | null {
  const d = `${row.direction} ${row.amountText}`.toLowerCase()
  if (
    /\b(debit|dr|out|sent|withdrawal)\b|^\s*[-−]|\s[-−]\s*(₦|ngn|#|n)?\s*\d/.test(
      d,
    )
  )
    return 'debit'
  if (
    /\b(credit|cr|in|received|deposit)\b|^\s*\+|\s\+\s*(₦|ngn|#|n)?\s*\d/.test(
      d,
    )
  )
    return 'credit'
  return null
}

// Rows grouped under a date heading often print only the time, so the day the
// screenshot covers fills the gap.
function rowTime(text: string, day: LagosMs): Stamp | null {
  const full = parseLagosStamp(text)
  if (full) return full
  const t = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text)
  if (!t) return null
  let h = +t[1]!
  if (t[4]?.toLowerCase() === 'pm' && h < 12) h += 12
  if (t[4]?.toLowerCase() === 'am' && h === 12) h = 0
  const min = +t[2]!
  const sec = t[3] ? +t[3] : 0
  if (h > 23 || min > 59 || sec > 59) return null
  return {
    ms: day + ((h * 60 + min) * 60 + sec) * 1000,
    precision: t[3] ? 'second' : 'minute',
  }
}

export function historyCredits(
  rows: RawHistoryRow[],
  opts: { screenshotId: string; bank: string | null; day: LagosMs },
): Credit[] {
  return rows.flatMap((raw, n) => {
    const row: RawHistoryRow = {
      amountText: clean(raw.amountText),
      direction: clean(raw.direction),
      description: clean(raw.description),
      dateTime: clean(raw.dateTime),
    }
    const amountKobo = parseNairaKobo(row.amountText)
    const dir = direction(row)
    if (amountKobo === null || amountKobo === 0 || !dir) return []
    const session = decodeSessionId(row.description)
    return [
      {
        id: `${opts.screenshotId}-${n + 1}`,
        bank: opts.bank,
        direction: dir,
        reversal: /\b(reversal|rvsl|reversed)\b/i.test(row.description),
        amountKobo,
        // Histories rarely name the payer; any name is left in the narration.
        sender: '',
        narration: row.description,
        sessionId: session.ok ? session.value.digits : null,
        reference: null,
        at: rowTime(row.dateTime, opts.day),
        source: 'history',
        strength: 'bank app',
      } satisfies Credit,
    ]
  })
}

function idsAgree(a: Credit, b: Credit): boolean | null {
  const full = (c: Credit) => c.sessionId
  const part = (c: Credit) => c.sessionId ?? sessionPrefix(c.narration)
  const pa = part(a)
  const pb = part(b)
  if (!pa || !pb) return null
  if (full(a) && full(b)) return full(a) === full(b)
  return pa.length >= pb.length ? prefixOf(pb, pa) : prefixOf(pa, pb)
}

// A screenshot repeats money the alerts already showed, and a vendor may take
// the same screenshot twice. A row is the same money when the amount and
// direction agree and either the session IDs agree or the times are within two
// minutes. Times win over disagreeing IDs: the model sometimes garbles several
// digits of a long ID, and two equal payments within two minutes are rarer.
export function newHistoryCredits(
  existing: Credit[],
  incoming: Credit[],
): Credit[] {
  const kept: Credit[] = []
  for (const row of incoming) {
    const seen = [...existing, ...kept].some((c) => {
      if (c.id === row.id) return false
      if (c.direction !== row.direction || c.amountKobo !== row.amountKobo)
        return false
      if (idsAgree(c, row)) return true
      return Boolean(
        c.at && row.at && Math.abs(c.at.ms - row.at.ms) <= 2 * 60_000,
      )
    })
    if (!seen) kept.push(row)
  }
  return kept
}
