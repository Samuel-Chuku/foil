import { findReversedCredits, type Ledger, type Verdict } from '../verify/match'
import { decodeSessionId } from '../verify/sessionId'
import type { Credit, Receipt, VerifyConfig } from '../verify/types'
import type { BookEntry, Order, Payment, Settlement } from './types'

// Nigerian numbers arrive as 0803..., +234 803..., 234803... or with spaces and
// dashes; all become 234803... so one customer is one record.
export function normalisePhone(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  if (/^0\d{10}$/.test(digits)) return `234${digits.slice(1)}`
  if (/^234\d{10}$/.test(digits)) return digits
  // Foreign numbers are kept as written, digits only.
  if (digits.length >= 8 && text.trim().startsWith('+')) return digits
  return null
}

export function nextOrderCode(orders: Order[]): string {
  const highest = orders.reduce((n, o) => Math.max(n, Number(o.code) || 0), 0)
  return String(highest + 1)
}

export function newOrder(
  orders: Order[],
  fields: Pick<Order, 'mode' | 'customerId' | 'items' | 'amountKobo'>,
  now: number,
): Order {
  return {
    ...fields,
    id: crypto.randomUUID(),
    code: nextOrderCode(orders),
    payment: {
      state: 'awaiting',
      reason: null,
      creditId: null,
      sessionId: null,
      candidates: [],
      decidedBy: null,
      checkedAt: null,
    },
    delivery: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

// What the matcher needs to know about every other order. The order being
// checked is left out, or re-checking it would find its own claim and report
// its own receipt as already used.
export function matcherLedger(
  orders: Order[],
  credits: Credit[],
  config: VerifyConfig,
  forOrderId?: string,
  settlements: Settlement[] = [],
): Ledger {
  // Money being refunded, or already refunded, can never pay an order.
  const refunds = new Set(
    settlements.filter((s) => s.state !== 'kept').map((s) => s.id),
  )
  const claimedCredits = new Map<string, string>()
  const usedSessionIds = new Map<string, string>()
  for (const o of orders) {
    if (o.id === forOrderId || o.payment.state !== 'matched') continue
    if (o.payment.creditId) claimedCredits.set(o.payment.creditId, o.code)
    if (o.payment.sessionId) usedSessionIds.set(o.payment.sessionId, o.code)
  }
  return {
    credits: credits.filter((c) => !refunds.has(c.id)),
    claimedCredits,
    usedSessionIds,
    reversedCredits: findReversedCredits(credits, config),
  }
}

export function recordVerdict(
  order: Order,
  receipt: Receipt,
  verdict: Verdict,
  now: number,
): Order {
  const session = decodeSessionId(receipt.reference)
  const payment: Payment = {
    state: verdict.kind,
    reason:
      verdict.kind === 'matched'
        ? verdict.notes.join(' ') || null
        : verdict.reason,
    creditId: verdict.kind === 'matched' ? verdict.creditId : null,
    sessionId:
      verdict.kind === 'matched' && session.ok ? session.value.digits : null,
    candidates: verdict.kind === 'check' ? verdict.candidates : [],
    decidedBy: 'rules',
    checkedAt: now,
  }
  return { ...order, payment, updatedAt: now }
}

// The vendor settles a "check" by picking the credit that pays for the order.
export function confirmCredit(
  order: Order,
  creditId: string,
  ledger: Ledger,
  now: number,
): { ok: true; order: Order } | { ok: false; reason: string } {
  const credit = ledger.credits.find((c) => c.id === creditId)
  if (!credit || credit.direction !== 'credit' || credit.reversal) {
    return { ok: false, reason: 'That is not a credit to your account.' }
  }
  if (ledger.reversedCredits.has(creditId)) {
    return { ok: false, reason: 'The bank reversed that credit.' }
  }
  const taken = ledger.claimedCredits.get(creditId)
  if (taken) {
    return { ok: false, reason: `That credit already pays for order ${taken}.` }
  }
  return {
    ok: true,
    order: {
      ...order,
      payment: {
        ...order.payment,
        state: 'matched',
        reason: 'Confirmed by you.',
        creditId,
        candidates: [],
        decidedBy: 'vendor',
        checkedAt: now,
      },
      updatedAt: now,
    },
  }
}

// The same alert can be imported twice: forwarded, re-sent by the bank or
// pasted again. A second copy has a new email id but the same session ID or
// document number, and must not become a second credit.
export function freshCredits(existing: Credit[], incoming: Credit[]): Credit[] {
  const keys = (c: Credit) =>
    [
      c.sessionId && `s ${c.direction} ${c.reversal} ${c.sessionId}`,
      c.reference && `r ${c.bank} ${c.direction} ${c.reference}`,
    ].filter((k): k is string => Boolean(k))
  const seen = new Map<string, string>()
  for (const c of existing) for (const k of keys(c)) seen.set(k, c.id)
  const kept: Credit[] = []
  for (const c of incoming) {
    const ks = keys(c)
    if (ks.some((k) => seen.has(k) && seen.get(k) !== c.id)) continue
    for (const k of ks) seen.set(k, c.id)
    kept.push(c)
  }
  return kept
}

// A reversal alert can arrive after an order was marked paid; that order is
// then unpaid again. Returns only the orders that changed.
export function applyReversals(
  orders: Order[],
  reversed: Set<string>,
  now: number,
): Order[] {
  return orders
    .filter(
      (o) =>
        o.payment.state === 'matched' &&
        o.payment.creditId !== null &&
        reversed.has(o.payment.creditId),
    )
    .map((o) => ({
      ...o,
      payment: {
        ...o.payment,
        state: 'mismatch',
        reason: 'The bank reversed the credit that paid for this order.',
        decidedBy: 'rules',
        checkedAt: now,
      },
      updatedAt: now,
    }))
}

// Built field by field, never by spreading the order, so a field added to
// Order later cannot reach the cloud without being added here on purpose.
export function toBookEntry(order: Order): BookEntry {
  return {
    orderId: order.id,
    mode: order.mode,
    amountKobo: order.amountKobo,
    payment: order.payment.state,
    decidedBy: order.payment.decidedBy,
    delivery: order.delivery,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.payment.state === 'matched' ? order.payment.checkedAt : null,
  }
}
