import { nameScore } from '../verify/names'
import type { Credit, VerifyConfig } from '../verify/types'
import type { Ledger } from '../verify/match'
import { balanceKobo, matcherLedger } from './ledger'
import type { Order, Settlement } from './types'

// Money that arrived but pays for no order. Reversed credits are left out:
// that money has already gone back.
export function unclaimedCredits(ledger: Ledger): Credit[] {
  return ledger.credits.filter(
    (c) =>
      c.direction === 'credit' &&
      !c.reversal &&
      !ledger.reversedCredits.has(c.id) &&
      !ledger.claimedCredits.has(c.id),
  )
}

// Other unclaimed money from whoever paid this credit: a customer who sent the
// same transfer twice shows up here.
export function moreFromPayer(
  paid: Credit,
  ledger: Ledger,
  config: VerifyConfig,
): Credit[] {
  return unclaimedCredits(ledger).filter(
    (c) =>
      c.id !== paid.id &&
      nameScore(paid.sender, `${c.sender} ${c.narration}`) >=
        config.nameThreshold,
  )
}

// A decision about a whole credit, or about the extra part of one (`part`).
export function settle(
  credit: Credit,
  state: Settlement['state'],
  customerId: string | null,
  now: number,
  part?: { id: string; amountKobo: number },
): Settlement {
  return {
    id: part?.id ?? credit.id,
    creditId: credit.id,
    amountKobo: part?.amountKobo ?? credit.amountKobo,
    state,
    customerId,
    refundId: null,
    decidedBy: 'vendor',
    updatedAt: now,
  }
}

// A refund owed is confirmed by an outgoing transfer of the same amount to the
// same name, after the money came in. Each debit confirms one refund only.
export function applyRefunds(
  settlements: Settlement[],
  credits: Credit[],
  config: VerifyConfig,
  now: number,
): Settlement[] {
  const used = new Set(
    settlements.flatMap((s) => (s.refundId ? [s.refundId] : [])),
  )
  const changed: Settlement[] = []
  for (const s of settlements) {
    if (s.state !== 'refund owed') continue
    const paid = credits.find((c) => c.id === s.creditId)
    if (!paid) continue
    const out = credits.find(
      (d) =>
        d.direction === 'debit' &&
        !d.reversal &&
        !used.has(d.id) &&
        d.amountKobo === s.amountKobo &&
        (!d.at || !paid.at || d.at.ms >= paid.at.ms) &&
        nameScore(paid.sender, `${d.sender} ${d.narration}`) >=
          config.nameThreshold,
    )
    if (!out) continue
    used.add(out.id)
    changed.push({
      ...s,
      state: 'refunded',
      refundId: out.id,
      decidedBy: 'rules',
      updatedAt: now,
    })
  }
  return changed
}

export const overId = (creditId: string) => `${creditId}:over`

export type ExtraRow = {
  // The settlement id this row's decision is stored under.
  key: string
  credit: Credit
  amountKobo: number
  settlement: Settlement | null
  // The order whose payment this is extra to, for an overpayment.
  orderCode: string | null
  // Whether it is known to be extra: its payer already has a paid order.
  settleable: boolean
}

// Everything that arrived but pays no order, newest first: credits no order
// claims, whole credits being refunded, and the part of a payment above its
// order's total.
export function extraMoney(
  orders: Order[],
  credits: Credit[],
  settlements: Settlement[],
  config: VerifyConfig,
): ExtraRow[] {
  const day = matcherLedger(orders, credits, config, undefined, settlements)
  const decided = (key: string) => settlements.find((s) => s.id === key) ?? null
  // A payer whose order is still short is probably sending its balance, so
  // their next payment is not called extra.
  const paidCredits = orders.flatMap((o) => {
    const c =
      o.payment.state === 'matched' && (balanceKobo(o, credits) ?? 0) <= 0
        ? credits.find((x) => x.id === o.payment.creditId)
        : undefined
    return c ? [c] : []
  })
  const fromPaidPayer = new Set(
    paidCredits.flatMap((c) => moreFromPayer(c, day, config).map((x) => x.id)),
  )
  const rows: ExtraRow[] = []
  for (const c of unclaimedCredits(day)) {
    rows.push({
      key: c.id,
      credit: c,
      amountKobo: c.amountKobo,
      settlement: decided(c.id),
      orderCode: null,
      settleable: fromPaidPayer.has(c.id),
    })
  }
  for (const s of settlements) {
    if (s.state === 'kept' || s.id !== s.creditId) continue
    const c = credits.find((x) => x.id === s.creditId)
    if (c) {
      rows.push({
        key: s.id,
        credit: c,
        amountKobo: s.amountKobo,
        settlement: s,
        orderCode: null,
        settleable: true,
      })
    }
  }
  for (const o of orders) {
    const balance = balanceKobo(o, credits)
    const c = credits.find((x) => x.id === o.payment.creditId)
    if (balance === null || balance >= 0 || !c) continue
    rows.push({
      key: overId(c.id),
      credit: c,
      amountKobo: -balance,
      settlement: decided(overId(c.id)),
      orderCode: o.code,
      settleable: true,
    })
  }
  return rows.sort((a, b) => (b.credit.at?.ms ?? 0) - (a.credit.at?.ms ?? 0))
}
