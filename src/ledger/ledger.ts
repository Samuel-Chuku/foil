import {
  findReversedCredits,
  verifyReceipt,
  type Ledger,
  type Verdict,
} from '../verify/match'
import { decodeSessionId } from '../verify/sessionId'
import { deliveryDueKobo } from '../capture/delivery'
import type { Credit, Receipt, VerifyConfig } from '../verify/types'
import type { BookEntry, MoneyEntry, Order, Payment, Settlement } from './types'

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

// Who a chat's customer is filed under: their number, or, for a saved
// WhatsApp contact whose number is not known yet, the contact's name.
export function customerKey(chatPhone: string): string | null {
  return (
    normalisePhone(chatPhone) ??
    (chatPhone.startsWith('name:') ? chatPhone : null)
  )
}

export function nextOrderCode(orders: Order[]): string {
  const highest = orders.reduce((n, o) => Math.max(n, Number(o.code) || 0), 0)
  return String(highest + 1)
}

export function newOrder(
  orders: Order[],
  fields: Pick<Order, 'mode' | 'customerId' | 'items' | 'amountKobo'> &
    Partial<Pick<Order, 'deliveryPlan'>>,
  now: number,
): Order {
  return {
    deliveryPlan: null,
    ...fields,
    id: crypto.randomUUID(),
    code: nextOrderCode(orders),
    payment: {
      state: 'awaiting',
      reason: null,
      creditId: null,
      sessionId: null,
      candidates: [],
      topUpIds: [],
      decidedBy: null,
      checkedAt: null,
    },
    receipt: null,
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
  // Only a whole credit is held back; the extra part of a credit still pays
  // its own order.
  const refunds = new Set(
    settlements
      .filter((s) => s.state !== 'kept' && s.id === s.creditId)
      .map((s) => s.id),
  )
  const claimedCredits = new Map<string, string>()
  const usedSessionIds = new Map<string, string>()
  for (const o of orders) {
    if (o.id === forOrderId || o.payment.state !== 'matched') continue
    if (o.payment.creditId) claimedCredits.set(o.payment.creditId, o.code)
    for (const t of o.payment.topUpIds) claimedCredits.set(t, o.code)
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
    topUpIds: [],
    decidedBy: 'rules',
    checkedAt: now,
  }
  return { ...order, payment, receipt, updatedAt: now }
}

const WAITING = new Set<Order['payment']['state']>([
  'not yet credited',
  'check',
])

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

// Checks every order still waiting on its money against the credits as they
// are now, oldest order first so it has first claim on a credit. Rules only,
// no model. Orders the vendor decided are left alone. Returns the orders whose
// verdict changed.
export function recheckOrders(
  orders: Order[],
  credits: Credit[],
  config: VerifyConfig,
  settlements: Settlement[],
  now: number,
): Order[] {
  let current = orders
  const changed: Order[] = []
  const oldestFirst = [...orders].sort((a, b) => a.createdAt - b.createdAt)
  for (const o of oldestFirst) {
    if (!o.receipt || !WAITING.has(o.payment.state)) continue
    if (o.payment.decidedBy === 'vendor') continue
    const verdict = verifyReceipt(
      o.receipt,
      matcherLedger(current, credits, config, o.id, settlements),
      config,
    )
    const same =
      verdict.kind === o.payment.state &&
      (verdict.kind !== 'check' ||
        sameIds(verdict.candidates, o.payment.candidates))
    if (same) continue
    const next = recordVerdict(o, o.receipt, verdict, now)
    current = current.map((x) => (x.id === o.id ? next : x))
    changed.push(next)
  }
  return changed
}

// What has arrived for an order: its credit plus any balance paid later.
export function paidKobo(order: Order, credits: Credit[]): number {
  const p = order.payment
  if (p.state !== 'matched') return 0
  return [p.creditId, ...p.topUpIds].reduce(
    (sum, id) => sum + (credits.find((c) => c.id === id)?.amountKobo ?? 0),
    0,
  )
}

// What the shop collects: the items, plus delivery when the customer pays it
// to the shop rather than to the rider.
export function dueKobo(order: Order): number | null {
  if (order.amountKobo === null) return null
  return order.amountKobo + deliveryDueKobo(order.deliveryPlan)
}

// Positive when the customer still owes money, negative when they paid more.
// Null until the order has a total and a payment.
export function balanceKobo(order: Order, credits: Credit[]): number | null {
  const due = dueKobo(order)
  if (due === null || order.payment.state !== 'matched') return null
  return due - paidKobo(order, credits)
}

// Records a verdict on an order that may already be paid. A second receipt on
// a short order pays its balance; a receipt that does not match never undoes a
// payment already confirmed. Returns null when nothing should change.
export function applyVerdict(
  order: Order,
  receipt: Receipt,
  verdict: Verdict,
  credits: Credit[],
  now: number,
): Order | null {
  const p = order.payment
  if (p.state !== 'matched') return recordVerdict(order, receipt, verdict, now)
  if (verdict.kind !== 'matched') return null
  if (verdict.creditId === p.creditId || p.topUpIds.includes(verdict.creditId))
    return null
  if ((balanceKobo(order, credits) ?? 0) > 0) {
    return {
      ...order,
      payment: { ...p, topUpIds: [...p.topUpIds, verdict.creditId] },
      updatedAt: now,
    }
  }
  return recordVerdict(order, receipt, verdict, now)
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
        // Kept so the choice can be undone and made again.
        candidates: order.payment.candidates,
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

// Undoes the vendor's pick of a credit: the order goes back to "check this"
// with the same candidates, and the credit is free again. Rule decisions are
// not undone here; "Verify again" re-runs them.
export function undoCreditPick(order: Order, now: number): Order | null {
  const p = order.payment
  if (p.decidedBy !== 'vendor' || p.state !== 'matched') return null
  return {
    ...order,
    payment: {
      ...p,
      state: 'check',
      reason:
        'Your choice was undone. Pick the credit that pays for this order.',
      creditId: null,
      decidedBy: 'rules',
      checkedAt: now,
    },
    updatedAt: now,
  }
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
export function toBookEntry(order: Order, credits: Credit[]): BookEntry {
  return {
    orderId: order.id,
    mode: order.mode,
    amountKobo: order.amountKobo,
    dueKobo: dueKobo(order),
    paidKobo: paidKobo(order, credits),
    payment: order.payment.state,
    decidedBy: order.payment.decidedBy,
    delivery: order.delivery,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.payment.state === 'matched' ? order.payment.checkedAt : null,
  }
}

export function toMoneyEntry(s: Settlement, credits: Credit[]): MoneyEntry {
  return {
    id: s.id,
    amountKobo: s.amountKobo,
    state: s.state,
    arrivedAt: credits.find((c) => c.id === s.creditId)?.at?.ms ?? null,
    updatedAt: s.updatedAt,
  }
}
