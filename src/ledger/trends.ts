import type { Credit, VerifyConfig } from '../verify/types'
import { formatNaira } from '../verify/money'
import { creditDay, dayBooks } from './dayBooks'
import type { Order, Settlement } from './types'

// The business over several days, as totals: sales by day, when orders come
// in, how long payment takes, which banks the money lands in, what sells.
// Worked out on the device; the cloud is given these numbers and never the
// orders behind them.

export type DayPoint = {
  day: string
  orders: number
  orderedKobo: number
  paidKobo: number
  // Ordered but not yet fully paid: waiting, to check, or still owed.
  openKobo: number
}

export type Period = { orders: number; orderedKobo: number; paidKobo: number }

export type Trends = {
  // Oldest first, one point per day including quiet days.
  days: DayPoint[]
  current: Period
  // The same number of days just before, for comparison.
  previous: Period
  // Orders by the Lagos hour they came in, 0 to 23.
  hours: number[]
  // Paid orders by how long they took from order to confirmed payment.
  payTimes: { label: string; count: number }[]
  medianPayMin: number | null
  banks: { bank: string | null; inKobo: number }[]
  items: { name: string; qty: number; kobo: number }[]
  moneyInKobo: number
  refundsSentKobo: number
  refundsOwedKobo: number
}

export const PAY_BUCKETS: { label: string; maxMin: number }[] = [
  { label: 'Under 15 min', maxMin: 15 },
  { label: '15 to 60 min', maxMin: 60 },
  { label: '1 to 3 hours', maxMin: 180 },
  { label: '3 to 24 hours', maxMin: 1440 },
  { label: 'Over a day', maxMin: Infinity },
]

// The day `n` days before or after a "2026-11-21" date.
export function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

export function trends(
  lastDay: string,
  span: number,
  data: { orders: Order[]; credits: Credit[]; settlements: Settlement[] },
  config: VerifyConfig,
  lagos: { day: (o: Order) => string; hour: (o: Order) => number },
): Trends {
  const firstDay = shiftDay(lastDay, 1 - span)
  const inSpan = (d: string | null, from: string, to: string) =>
    d !== null && d >= from && d <= to
  const days: DayPoint[] = []
  const items = new Map<string, { name: string; qty: number; kobo: number }>()
  let refundsSentKobo = 0
  let refundsOwedKobo = 0
  for (let i = 0; i < span; i++) {
    const day = shiftDay(firstDay, i)
    const b = dayBooks(day, data, config, lagos.day)
    days.push({
      day,
      orders: b.orders,
      orderedKobo: b.orderedKobo,
      paidKobo: b.paid.kobo,
      openKobo: b.waiting.kobo + b.toCheck.kobo + b.short.kobo,
    })
    refundsSentKobo += b.refundsSent.kobo
    refundsOwedKobo += b.refundsOwed.kobo
    for (const it of b.items) {
      const key = it.name.toLowerCase()
      const row = items.get(key) ?? { name: it.name, qty: 0, kobo: 0 }
      row.qty += it.qty
      row.kobo += it.kobo
      items.set(key, row)
    }
  }
  const sum = (points: DayPoint[]): Period => ({
    orders: points.reduce((s, p) => s + p.orders, 0),
    orderedKobo: points.reduce((s, p) => s + p.orderedKobo, 0),
    paidKobo: points.reduce((s, p) => s + p.paidKobo, 0),
  })
  const before = [...Array(span).keys()].map((i) => {
    const b = dayBooks(shiftDay(firstDay, i - span), data, config, lagos.day)
    return {
      day: b.day,
      orders: b.orders,
      orderedKobo: b.orderedKobo,
      paidKobo: b.paid.kobo,
      openKobo: 0,
    }
  })

  const orders = data.orders.filter((o) =>
    inSpan(lagos.day(o), firstDay, lastDay),
  )
  const hours = Array<number>(24).fill(0)
  for (const o of orders) {
    const h = lagos.hour(o)
    hours[h] = (hours[h] ?? 0) + 1
  }

  const waits = orders
    .filter((o) => o.payment.state === 'matched' && o.payment.checkedAt)
    .map((o) =>
      Math.max(0, ((o.payment.checkedAt ?? 0) - o.createdAt) / 60_000),
    )
    .sort((a, b) => a - b)
  const payTimes = PAY_BUCKETS.map((b, i) => ({
    label: b.label,
    count: waits.filter(
      (w) => w < b.maxMin && w >= (PAY_BUCKETS[i - 1]?.maxMin ?? 0),
    ).length,
  }))
  const medianPayMin = waits.length
    ? Math.round(
        waits.length % 2
          ? waits[(waits.length - 1) / 2]!
          : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2,
      )
    : null

  const banks = new Map<string | null, number>()
  let moneyInKobo = 0
  for (const c of data.credits) {
    if (c.direction !== 'credit' || c.reversal) continue
    if (!inSpan(creditDay(c), firstDay, lastDay)) continue
    banks.set(c.bank, (banks.get(c.bank) ?? 0) + c.amountKobo)
    moneyInKobo += c.amountKobo
  }

  return {
    days,
    current: sum(days),
    previous: sum(before),
    hours,
    payTimes,
    medianPayMin,
    banks: [...banks]
      .map(([bank, inKobo]) => ({ bank, inKobo }))
      .sort((a, b) => b.inKobo - a.inKobo),
    items: [...items.values()]
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
      .slice(0, 8),
    moneyInKobo,
    refundsSentKobo,
    refundsOwedKobo,
  }
}

const change = (now: number, before: number) =>
  before === 0
    ? now === 0
      ? 'no change'
      : 'none in the period before'
    : `${now >= before ? 'up' : 'down'} ${Math.abs(Math.round(((now - before) / before) * 100))}%`

// The numbers as the plain lines the vendor approves and the cloud reads.
export function trendsText(
  t: Trends,
  bankName: (id: string | null) => string,
): string {
  const first = t.days[0]?.day ?? ''
  const last = t.days[t.days.length - 1]?.day ?? ''
  const busiest = t.hours
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  return [
    `Trends for ${first} to ${last} (${t.days.length} days, Lagos):`,
    `Orders: ${t.current.orders} (${change(t.current.orders, t.previous.orders)} on the ${t.days.length} days before). Worth ${formatNaira(t.current.orderedKobo)} (${change(t.current.orderedKobo, t.previous.orderedKobo)}). Fully paid ${formatNaira(t.current.paidKobo)} (${change(t.current.paidKobo, t.previous.paidKobo)}).`,
    `By day (orders, worth, paid, still open): ${t.days
      .map(
        (d) =>
          `${d.day}: ${d.orders}, ${formatNaira(d.orderedKobo)}, ${formatNaira(d.paidKobo)}, ${formatNaira(d.openKobo)}`,
      )
      .join('; ')}.`,
    `Busiest hours for orders: ${busiest.length ? busiest.map((h) => `${h.hour}:00 (${h.count})`).join(', ') : 'none yet'}.`,
    `Time from order to confirmed payment: ${t.payTimes.map((p) => `${p.label.toLowerCase()} ${p.count}`).join(', ')}; median ${t.medianPayMin === null ? 'not known' : `${t.medianPayMin} min`}.`,
    `Money in by bank: ${t.banks.length ? t.banks.map((b) => `${bankName(b.bank)} ${formatNaira(b.inKobo)}`).join(', ') : 'none'}. Total ${formatNaira(t.moneyInKobo)}.`,
    `Top items on paid orders: ${t.items.length ? t.items.map((i) => `${i.qty} x ${i.name}`).join(', ') : 'none yet'}.`,
    `Refunds sent ${formatNaira(t.refundsSentKobo)}, still owed ${formatNaira(t.refundsOwedKobo)}.`,
  ].join('\n')
}
