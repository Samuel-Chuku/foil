import { balanceKobo, dueKobo, paidKobo } from '../ledger/ledger'
import { DELIVERY, PAYMENT, where } from '../ledger/snapshot'
import type { Order } from '../ledger/types'
import type { Credit } from '../verify/types'

// What the desk writes to the vendor's own Google Sheet: the orders, and a
// line per day. Customer names go only when the vendor ticks for them;
// phone numbers and addresses never go.

export type Cell = string | number
export type Table = Cell[][]

export type SheetOptions = {
  // Include each order's customer name.
  names: boolean
}

// Amounts go as numbers in the currency's main unit, so the sheet can sum
// them.
const major = (kobo: number | null) => (kobo === null ? '' : kobo / 100)

export function ordersTable(
  orders: Order[],
  credits: Credit[],
  day: (o: Order) => string,
  name: (customerId: string | null) => string,
  opts: SheetOptions,
): Table {
  const head = [
    'Day',
    'Order',
    ...(opts.names ? ['Customer'] : []),
    'Items',
    'Amount',
    'Paid',
    'Still owed',
    'Payment',
    'Delivery',
    'Where',
  ]
  const rows = [...orders]
    .sort(
      (a, b) => day(a).localeCompare(day(b)) || Number(a.code) - Number(b.code),
    )
    .map((o) => {
      const owed = balanceKobo(o, credits)
      return [
        day(o),
        Number(o.code) || o.code,
        ...(opts.names ? [name(o.customerId)] : []),
        o.items.map((i) => `${i.qty} x ${i.name}`).join(', '),
        major(dueKobo(o)),
        major(paidKobo(o, credits)),
        owed === null ? '' : major(Math.max(0, owed)),
        PAYMENT[o.payment.state],
        DELIVERY[o.delivery],
        where(o),
      ]
    })
  return [head, ...rows]
}

export function dailyTable(
  orders: Order[],
  credits: Credit[],
  day: (o: Order) => string,
): Table {
  const by = new Map<string, Order[]>()
  for (const o of orders) by.set(day(o), [...(by.get(day(o)) ?? []), o])
  const rows = [...by.keys()].sort().map((d) => {
    const os = by.get(d)!
    const paid = os.filter((o) => o.payment.state === 'matched')
    const owed = os.reduce(
      (n, o) => n + Math.max(0, balanceKobo(o, credits) ?? dueKobo(o) ?? 0),
      0,
    )
    return [
      d,
      os.length,
      paid.length,
      major(paid.reduce((n, o) => n + paidKobo(o, credits), 0)),
      major(owed),
    ]
  })
  return [['Day', 'Orders', 'Paid orders', 'Money in', 'Still owed'], ...rows]
}

// The approval dialog shows the tables exactly as they will be written.
export function tableText(title: string, t: Table): string {
  return [title, ...t.map((r) => r.join(' | '))].join('\n')
}
