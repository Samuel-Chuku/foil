import type { Credit } from '../verify/types'
import type { Order, Settlement } from './types'

// Every credit and debit the desk has read, by day and then by bank, as a
// statement the vendor can scan. On the device only; the cloud books never
// see who paid.

export type FlowRow = {
  credit: Credit
  // The order this money paid for, if any.
  orderCode: string | null
  // An outgoing transfer the vendor recorded as a refund.
  refund: boolean
}

export type BankFlow = {
  bank: string | null
  inKobo: number
  outKobo: number
  rows: FlowRow[]
}

export type DayFlow = {
  // "2026-11-21" in Lagos time, or null when the bank gave no date.
  day: string | null
  inKobo: number
  outKobo: number
  banks: BankFlow[]
}

// Credit times are Lagos wall-clock milliseconds, so the UTC date is the
// Lagos date.
const dayOf = (c: Credit) =>
  c.at ? new Date(c.at.ms).toISOString().slice(0, 10) : null

function totals(rows: FlowRow[]) {
  let inKobo = 0
  let outKobo = 0
  for (const r of rows) {
    if (r.credit.direction === 'credit') inKobo += r.credit.amountKobo
    else outKobo += r.credit.amountKobo
  }
  return { inKobo, outKobo }
}

export function moneyFlow(
  credits: Credit[],
  orders: Order[],
  settlements: Settlement[],
): DayFlow[] {
  const paidBy = new Map<string, string>()
  for (const o of orders) {
    if (o.payment.state !== 'matched') continue
    if (o.payment.creditId) paidBy.set(o.payment.creditId, o.code)
    for (const t of o.payment.topUpIds) paidBy.set(t, o.code)
  }
  const refunds = new Set(settlements.flatMap((s) => s.refundId ?? []))
  const newestFirst = [...credits].sort(
    (a, b) => (b.at?.ms ?? -Infinity) - (a.at?.ms ?? -Infinity),
  )

  const days = new Map<string | null, FlowRow[]>()
  for (const c of newestFirst) {
    const key = dayOf(c)
    const row: FlowRow = {
      credit: c,
      orderCode: paidBy.get(c.id) ?? null,
      refund: refunds.has(c.id),
    }
    days.set(key, [...(days.get(key) ?? []), row])
  }

  return [...days].map(([day, rows]) => {
    const byBank = new Map<string | null, FlowRow[]>()
    for (const r of rows) {
      byBank.set(r.credit.bank, [...(byBank.get(r.credit.bank) ?? []), r])
    }
    return {
      day,
      ...totals(rows),
      banks: [...byBank]
        .map(([bank, bankRows]) => ({
          bank,
          ...totals(bankRows),
          rows: bankRows,
        }))
        .sort((a, b) => (a.bank ?? '~').localeCompare(b.bank ?? '~')),
    }
  })
}
