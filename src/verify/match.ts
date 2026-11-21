import { bankFromNipCode } from './banks'
import { sessionPrefix } from './history'
import { formatNaira } from './money'
import { nameScore } from './names'
import {
  decodeSessionId,
  digitRuns,
  prefixOf,
  sameSessionId,
  type SessionIdResult,
} from './sessionId'
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

// The model sometimes adds or drops one digit when reading a long ID, which
// leaves 29 or 31 digits that cannot be decoded. When such a reading is one
// edit away from exactly one alert's ID, it is that ID. Two or more close IDs
// prove nothing, so the reading stays unreadable.
function recoverSessionId(
  receipt: Receipt,
  ledger: Ledger,
): SessionIdResult | null {
  const runs = digitRuns(receipt.reference).filter(
    (r) => r.length >= 29 && r.length <= 31,
  )
  if (runs.length === 0) return null
  const close = new Set<string>()
  for (const c of ledger.credits) {
    if (c.direction !== 'credit' || c.reversal || !c.sessionId) continue
    if (runs.some((r) => sameSessionId(r, c.sessionId!))) close.add(c.sessionId)
  }
  if (close.size !== 1) return null
  const [id] = close
  const value = decodeSessionId(id!)
  return value.ok ? value : null
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

  const decoded = decodeSessionId(receipt.reference)
  // One misread digit can move the date inside an ID by decades. Such an ID is
  // unreadable, not evidence: it must lead to "check", never to a mismatch.
  const readable: SessionIdResult =
    decoded.ok &&
    receipt.at &&
    Math.abs(decoded.value.stampedMs - receipt.at.ms) > 366 * 86_400_000
      ? { ok: false, reason: 'date' }
      : decoded
  const notes: string[] = []
  const recovered = readable.ok ? null : recoverSessionId(receipt, ledger)
  const session: SessionIdResult = recovered ?? readable
  if (recovered) {
    notes.push(
      'One digit of the session ID was misread; the rest agrees with the bank alert.',
    )
  }

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
      const offsets =
        codeBank?.sessionOffsetMin != null
          ? [codeBank.sessionOffsetMin]
          : config.sessionOffsetsMin
      const fits = offsets.some(
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
    // A bank-app row shows no payer name, so a missing match proves nothing.
    nameUnknown: boolean
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
    } else if (session.ok && c.source === 'history') {
      // Bank apps cut the ID short; the part shown must start the receipt's ID.
      const prefix = sessionPrefix(c.narration)
      if (prefix) {
        if (!prefixOf(prefix, session.value.digits)) continue
        byId = true
      }
    }
    const window = sameBank
      ? config.sameBankWindowMin
      : config.interbankWindowMin
    const nameOk =
      nameScore(receipt.sender, `${c.sender} ${c.narration}`) >=
      config.nameThreshold
    scored.push({
      credit: c,
      byId,
      nameOk,
      nameUnknown: !nameOk && c.source === 'history',
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
    // Without this the vendor would read "not arrived yet" and keep waiting
    // for money the bank has already taken back.
    const reversed = ledger.credits.find(
      (c) =>
        ledger.reversedCredits.has(c.id) &&
        c.amountKobo === receipt.amountKobo &&
        (session.ok && c.sessionId
          ? sameSessionId(c.sessionId, session.value.digits)
          : nameScore(receipt.sender, `${c.sender} ${c.narration}`) >=
            config.nameThreshold),
    )
    if (reversed) {
      return {
        kind: 'not yet credited',
        reason: `A credit of ${formatNaira(receipt.amountKobo)} arrived for this receipt, but the bank later reversed it, so it is not paid.`,
      }
    }
    // A different name is not proof of a problem: the model may have misread
    // it, or a relative or a business account paid. The vendor decides.
    const unnamed = scored.filter(
      (s) =>
        s.timeOk && s.nameUnknown && !ledger.claimedCredits.has(s.credit.id),
    )
    if (unnamed.length > 0) {
      return {
        kind: 'check',
        reason: `${unnamed.length === 1 ? 'A credit' : `${unnamed.length} credits`} of ${formatNaira(receipt.amountKobo)} in your bank app fit the time, but the screenshot shows no payer name. Confirm which pays for this order, if any.`,
        candidates: unnamed.map((s) => s.credit.id),
      }
    }
    const otherName = scored.filter(
      (s) => s.timeOk && !s.nameOk && !ledger.claimedCredits.has(s.credit.id),
    )
    if (otherName.length > 0) {
      const amount = formatNaira(receipt.amountKobo)
      const onReceipt = receipt.sender || 'the name on the receipt'
      return {
        kind: 'check',
        reason:
          otherName.length === 1
            ? `A credit of ${amount} arrived at the right time from ${otherName[0]!.credit.sender || 'a different name'}, not ${onReceipt}. Confirm it is this customer's payment.`
            : `${otherName.length} credits of ${amount} arrived at the right time from names other than ${onReceipt}. Pick the one that pays for this order, if any.`,
        candidates: otherName.map((s) => s.credit.id),
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
  // Same-bank transfers never pass through NIP, and some banks never print the
  // ID, so only interbank receipts from banks that do must carry a readable one.
  const shownBank = config.banks.find((b) => b.id === receipt.senderBank)
  const interbank =
    receipt.senderBank !== null && receipt.senderBank !== chosen.credit.bank
  if (
    !session.ok &&
    session.reason !== 'other-route' &&
    interbank &&
    shownBank?.receiptShowsSessionId &&
    !chosen.byId
  ) {
    return {
      kind: 'check',
      reason:
        session.reason === 'missing'
          ? 'An interbank receipt should carry a session ID, and none was found. Please check it.'
          : "Couldn't read the session ID on the receipt. Please check it.",
      candidates: [chosen.credit.id],
    }
  }
  const fromApp = chosen.credit.source === 'history'
  // A recovered ID already said it agrees once one digit is corrected.
  if (chosen.byId && !recovered)
    notes.push(
      fromApp
        ? 'The start of the session ID matches a row in your bank app.'
        : 'The session ID on the receipt matches the bank alert.',
    )
  if (chosen.byId && !chosen.nameOk && !fromApp) {
    notes.push(
      'The sender name reads differently on the alert, but the session ID agrees.',
    )
  }
  if (fromApp) notes.push('Confirmed against your bank app screenshot.')
  if (chosen.credit.strength === 'alert received') {
    notes.push(
      `Confirmed against ${config.banks.find((b) => b.id === chosen.credit.bank)?.name ?? 'a bank'} alert email.`,
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
