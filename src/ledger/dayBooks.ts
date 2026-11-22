import type { Credit, VerifyConfig } from '../verify/types'
import { formatMoney } from '../verify/money'
import { balanceKobo, dueKobo, paidKobo } from './ledger'
import { extraMoney } from './settle'
import type { Order, Settlement } from './types'

// A day's books as totals and open orders by number: what was ordered, what
// landed, what is still waiting, and what is still to go out. Nothing here
// says who; this is the
// only view of the day the cloud books chat is given.

export type Tally = { count: number; kobo: number }

export type OpenOrder = {
  code: string
  // What the shop collects, or null while the order has no price.
  dueKobo: number | null
  status: string
}

export type DayBooks = {
  // "2026-11-21", Lagos date.
  day: string
  orders: number
  dropOrders: number
  // Orders still without a total, so they are left out of the sums below.
  unpriced: number
  orderedKobo: number
  // Fully paid, by matched credits.
  paid: Tally
  // Paid in part: the count, and what is still owed on them.
  short: Tally
  // No payment confirmed yet: no receipt, or one not yet credited.
  waiting: Tally
  // Receipts that do not match, or that the vendor must confirm.
  toCheck: Tally
  moneyInKobo: number
  moneyOutKobo: number
  // Money that arrived but pays no order and has no decision yet.
  notTied: Tally
  refundsOwed: Tally
  refundsSent: Tally
  kept: Tally
  // Paid orders by how far they have got.
  delivery: { toSend: number; out: number; done: number }
  // What sold on paid orders, most first.
  items: { name: string; qty: number; kobo: number }[]
  // Every order still needing something, by its number: payment, a price,
  // a check or delivery. Numbers only, so the cloud chat can name orders
  // without knowing whose they are.
  open: OpenOrder[]
}

const tally = (): Tally => ({ count: 0, kobo: 0 })
const add = (t: Tally, kobo: number) => {
  t.count += 1
  t.kobo += kobo
}

// Credit times are Lagos wall-clock milliseconds, so the UTC date is the
// Lagos date.
export const creditDay = (c: Credit) =>
  c.at ? new Date(c.at.ms).toISOString().slice(0, 10) : null

// Every day with an order or a dated credit, newest first.
export function bookDays(
  orders: Order[],
  credits: Credit[],
  orderDay: (o: Order) => string,
): string[] {
  const days = new Set([
    ...orders.map(orderDay),
    ...credits.flatMap((c) => creditDay(c) ?? []),
  ])
  return [...days].sort().reverse()
}

export function dayBooks(
  day: string,
  data: { orders: Order[]; credits: Credit[]; settlements: Settlement[] },
  config: VerifyConfig,
  orderDay: (o: Order) => string,
): DayBooks {
  const { credits, settlements } = data
  const orders = data.orders.filter((o) => orderDay(o) === day)
  const b: DayBooks = {
    day,
    orders: orders.length,
    dropOrders: orders.filter((o) => o.mode === 'drop').length,
    unpriced: 0,
    orderedKobo: 0,
    paid: tally(),
    short: tally(),
    waiting: tally(),
    toCheck: tally(),
    moneyInKobo: 0,
    moneyOutKobo: 0,
    notTied: tally(),
    refundsOwed: tally(),
    refundsSent: tally(),
    kept: tally(),
    delivery: { toSend: 0, out: 0, done: 0 },
    items: [],
    open: [],
  }
  const items = new Map<string, { name: string; qty: number; kobo: number }>()

  for (const o of orders) {
    const due = dueKobo(o)
    const open = (status: string) =>
      b.open.push({ code: o.code, dueKobo: due, status })
    if (due === null) {
      b.unpriced += 1
      open('no price yet')
      continue
    }
    b.orderedKobo += due
    const state = o.payment.state
    if (state === 'matched') {
      const owed = balanceKobo(o, credits) ?? 0
      if (owed > 0) add(b.short, owed)
      else add(b.paid, paidKobo(o, credits))
      const paid = owed > 0 ? `paid in part, ${formatMoney(owed)} owed` : 'paid'
      if (o.delivery === 'pending') {
        b.delivery.toSend += 1
        open(`${paid}, to send`)
      } else if (o.delivery === 'out') {
        b.delivery.out += 1
        open(`${paid}, out for delivery`)
      } else {
        b.delivery.done += 1
        if (owed > 0) open(`${paid}, already delivered`)
      }
      for (const i of o.items) {
        const key = i.name.trim().toLowerCase()
        const row = items.get(key) ?? { name: i.name.trim(), qty: 0, kobo: 0 }
        row.qty += i.qty
        row.kobo += (i.priceKobo ?? 0) * i.qty
        items.set(key, row)
      }
    } else if (state === 'mismatch' || state === 'check') {
      add(b.toCheck, due)
      open(state === 'mismatch' ? 'receipt does not match' : 'receipt to check')
    } else {
      add(b.waiting, due)
      open(state === 'awaiting' ? 'waiting for payment' : 'not yet credited')
    }
  }
  b.open.sort(
    (x, y) => Number(x.code) - Number(y.code) || x.code.localeCompare(y.code),
  )
  b.items = [...items.values()].sort(
    (x, y) => y.qty - x.qty || x.name.localeCompare(y.name),
  )

  for (const c of credits) {
    if (creditDay(c) !== day || c.reversal) continue
    if (c.direction === 'credit') b.moneyInKobo += c.amountKobo
    else b.moneyOutKobo += c.amountKobo
  }

  for (const r of extraMoney(data.orders, credits, settlements, config)) {
    if (creditDay(r.credit) !== day) continue
    const s = r.settlement?.state
    if (!s) add(b.notTied, r.amountKobo)
    else if (s === 'refund owed') add(b.refundsOwed, r.amountKobo)
    else if (s === 'refunded') add(b.refundsSent, r.amountKobo)
  }
  // Kept money is no longer listed as extra, so it is counted from the
  // decisions themselves.
  for (const s of settlements) {
    const c = credits.find((x) => x.id === s.creditId)
    if (s.state === 'kept' && c && creditDay(c) === day)
      add(b.kept, s.amountKobo)
  }
  return b
}

const many = (count: number, what: string) =>
  `${count} ${what}${count === 1 ? '' : 's'}`
const n = (t: Tally, what: string) =>
  `${many(t.count, what)}, ${formatMoney(t.kobo)}`

// The books as the plain lines the vendor approves and the cloud reads.
export function booksText(b: DayBooks): string {
  const lines = [
    `Books for ${b.day} (Lagos):`,
    `Orders: ${b.orders}${b.dropOrders ? ` (${b.dropOrders} from a status drop)` : ''}, worth ${formatMoney(b.orderedKobo)}${b.unpriced ? `; ${b.unpriced} still without a price` : ''}.`,
    `Fully paid: ${n(b.paid, 'order')}.`,
    `Paid in part: ${many(b.short.count, 'order')}, ${formatMoney(b.short.kobo)} still owed.`,
    `Waiting for payment: ${n(b.waiting, 'order')}.`,
    `Receipts to check: ${n(b.toCheck, 'order')}.`,
    `Money in from the banks: ${formatMoney(b.moneyInKobo)}. Money out: ${formatMoney(b.moneyOutKobo)}.`,
    `Money that pays no order, not yet decided: ${n(b.notTied, 'payment')}.`,
    `Refunds owed: ${n(b.refundsOwed, 'refund')}. Refunds sent: ${n(b.refundsSent, 'refund')}. Extra money kept: ${formatMoney(b.kept.kobo)}.`,
    `Paid orders to send: ${b.delivery.toSend}. Out with a rider: ${b.delivery.out}. Delivered or collected: ${b.delivery.done}.`,
  ]
  if (b.items.length) {
    lines.push(
      `Sold on paid orders: ${b.items
        .map(
          (i) =>
            `${i.qty} x ${i.name}${i.kobo ? ` (${formatMoney(i.kobo)})` : ''}`,
        )
        .join('; ')}.`,
    )
  }
  if (b.open.length) {
    lines.push(
      `Open orders, by number: ${b.open
        .map(
          (o) =>
            `order ${o.code}${o.dueKobo === null ? '' : `, ${formatMoney(o.dueKobo)}`}, ${o.status}`,
        )
        .join('; ')}.`,
    )
  }
  return lines.join('\n')
}
