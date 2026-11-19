import { bankFromNipCode } from './banks'
import { formatNaira } from './money'
import { nameScore } from './names'
import { decodeSessionId, sameSessionId } from './sessionId'
import type { Credit, Receipt, Stamp, VerifyConfig } from './types'

const MIN = 60_000

export type Verdict =
  | { kind: 'matched'; creditId: string; notes: string[] }
  | { kind: 'not yet credited'; reason: string }
  | { kind: 'mismatch'; reason: string }
  // The rules cannot decide alone; the vendor confirms or picks a credit.
  | { kind: 'check'; reason: string; candidates: string[] }

export type Ledger = {
  credits: Credit[]
  // Credit id to the order it already pays for.
  claimedCredits: Map<string, string>
  // Session IDs on receipts already accepted, to the order they belong to.
  usedSessionIds: Map<string, string>
  // Credits a later reversal cancelled.
  reversedCredits: Set<string>
}

function minutesApart(a: Stamp, b: Stamp): number | null {
  if (a.precision === 'day' || b.precision === 'day') return null
  return (b.ms - a.ms) / MIN
}

function sameDay(a: Stamp, b: Stamp): boolean {
  return Math.floor(a.ms / 86_400_000) === Math.floor(b.ms / 86_400_000)
}

function timeFits(
  receipt: Stamp | null,
  credit: Stamp | null,
  windowMin: number,
  config: VerifyConfig,
): boolean {
  if (!receipt || !credit) return true
  const gap = minutesApart(receipt, credit)
  if (gap === null) return sameDay(receipt, credit)
  return (
    gap >= -config.clockToleranceMin &&
    gap <= windowMin + config.clockToleranceMin
  )
}

export function verifyReceipt(
  receipt: Receipt,
  ledger: Ledger,
  config: VerifyConfig,
): Verdict {
  if (receipt.status === 'failed') {
    return {
      kind: 'mismatch',
      reason: 'The receipt itself says the transfer failed.',
    }
  }
  if (receipt.status === 'pending') {
    return {
      kind: 'not yet credited',
      reason: 'The receipt says the transfer is still pending.',
    }
  }
  if (receipt.amountKobo === null) {
    return {
      kind: 'check',
      reason: "Couldn't read the amount on the receipt.",
      candidates: [],
    }
  }

  const session = decodeSessionId(receipt.reference)
  const notes: string[] = []

  if (session.ok) {
    const sid = session.value
    const codeBank = bankFromNipCode(config.banks, sid.nipCode)
    if (codeBank && receipt.senderBank && codeBank.id !== receipt.senderBank) {
      const shown = config.banks.find((b) => b.id === receipt.senderBank)?.name
      return {
        kind: 'mismatch',
        reason: `The session ID was issued by ${codeBank.name}, but the receipt is from ${shown ?? receipt.senderBank}.`,
      }
    }
    if (receipt.at && receipt.at.precision !== 'day') {
      const gap = (receipt.at.ms - sid.stampedMs) / MIN
      const fits = config.sessionOffsetsMin.some(
        (o) => Math.abs(gap - o) <= config.clockToleranceMin,
      )
      if (!fits) {
        return {
          kind: 'mismatch',
          reason:
            "The time inside the session ID doesn't agree with the time on the receipt.",
        }
      }
    }
    for (const [used, order] of ledger.usedSessionIds) {
      if (sameSessionId(used, sid.digits)) {
        return {
          kind: 'mismatch',
          reason: `This receipt's session ID was already used for order ${order}.`,
        }
      }
    }
  }

  const amountFits = ledger.credits.filter(
    (c) =>
      c.direction === 'credit' &&
      !c.reversal &&
      !ledger.reversedCredits.has(c.id) &&
      c.amountKobo === receipt.amountKobo,
  )

  type Scored = {
    credit: Credit
    byId: boolean
    nameOk: boolean
    timeOk: boolean
  }
  const scored: Scored[] = []
  for (const c of amountFits) {
    const sameBank =
      receipt.senderBank !== null && receipt.senderBank === c.bank
    let byId = false
    if (session.ok && c.sessionId) {
      if (!sameSessionId(c.sessionId, session.value.digits)) continue
      byId = true
    }
    const window = sameBank
      ? config.sameBankWindowMin
      : config.interbankWindowMin
    scored.push({
      credit: c,
      byId,
      nameOk:
        nameScore(receipt.sender, `${c.sender} ${c.narration}`) >=
        config.nameThreshold,
      timeOk: timeFits(receipt.at, c.at, window, config),
    })
  }

  const passing = scored.filter((s) => s.byId || (s.nameOk && s.timeOk))
  const free = passing.filter((s) => !ledger.claimedCredits.has(s.credit.id))

  if (free.length === 0) {
    const taken = passing.find((s) => ledger.claimedCredits.has(s.credit.id))
    if (taken) {
      return {
        kind: 'mismatch',
        reason: `The matching credit already pays for order ${ledger.claimedCredits.get(taken.credit.id)}.`,
      }
    }
    const wrongName = scored.find((s) => s.timeOk && !s.nameOk)
    if (wrongName) {
      return {
        kind: 'mismatch',
        reason: `A credit of ${formatNaira(receipt.amountKobo)} arrived at the right time, but it came from ${wrongName.credit.sender || 'a different name'}, not ${receipt.sender || 'the name on the receipt'}.`,
      }
    }
    return {
      kind: 'not yet credited',
      reason: `No credit of ${formatNaira(receipt.amountKobo)} that fits this receipt has arrived yet.`,
    }
  }

  const strongest = free.filter((s) => s.byId)
  const pick = strongest.length === 1 ? strongest : free
  if (pick.length > 1) {
    return {
      kind: 'check',
      reason: `${pick.length} credits of ${formatNaira(receipt.amountKobo)} fit this receipt. Pick the right one.`,
      candidates: pick.map((s) => s.credit.id),
    }
  }
  const chosen = pick[0]!
  // Same-bank transfers never pass through NIP, so only interbank receipts
  // must carry a readable session ID.
  const interbank =
    receipt.senderBank !== null && receipt.senderBank !== chosen.credit.bank
  if (!session.ok && interbank && !chosen.byId) {
    return {
      kind: 'check',
      reason:
        session.reason === 'missing'
          ? 'An interbank receipt should carry a session ID, and none was found. Please check it.'
          : "Couldn't read the session ID on the receipt. Please check it.",
      candidates: [chosen.credit.id],
    }
  }
  if (chosen.byId)
    notes.push('The session ID on the receipt matches the bank alert.')
  if (chosen.byId && !chosen.nameOk) {
    notes.push(
      'The sender name reads differently on the alert, but the session ID agrees.',
    )
  }
  if (chosen.credit.strength === 'alert received') {
    notes.push(
      `Confirmed against a ${chosen.credit.bank ?? 'bank'} alert email.`,
    )
  }
  return { kind: 'matched', creditId: chosen.credit.id, notes }
}

// A reversal cancels an earlier credit of the same amount from the same payer,
// or with the same session ID. Orders paid by a cancelled credit must be checked again.
export function findReversedCredits(
  credits: Credit[],
  config: VerifyConfig,
): Set<string> {
  const reversed = new Set<string>()
  for (const r of credits.filter(
    (c) => c.reversal && c.direction === 'debit',
  )) {
    const original = credits
      .filter(
        (c) =>
          c.direction === 'credit' &&
          !c.reversal &&
          !reversed.has(c.id) &&
          c.amountKobo === r.amountKobo &&
          (!c.at || !r.at || c.at.ms <= r.at.ms),
      )
      .find((c) =>
        c.sessionId && r.sessionId
          ? sameSessionId(c.sessionId, r.sessionId)
          : nameScore(c.sender, `${r.sender} ${r.narration}`) >=
            config.nameThreshold,
      )
    if (original) reversed.add(original.id)
  }
  return reversed
}
