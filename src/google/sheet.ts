import { balanceKobo, dueKobo, paidKobo } from '../ledger/ledger'
import { DELIVERY, PAYMENT, where } from '../ledger/snapshot'
import type { Order } from '../ledger/types'
import type { Credit } from '../verify/types'

// What the desk writes to the vendor's own Google Sheet: the orders, and a
// line per day with a total. Customer names go only when the vendor ticks
// for them; phone numbers and addresses never go. The layout is fixed here,
// not left to a model, so every send looks the same.

export type Cell = string | number
export type Table = Cell[][]

// How a column shows in the sheet.
export type Kind = 'date' | 'order' | 'money' | 'count' | 'text' | 'long'

export type SheetTab = {
  title: string
  kinds: Kind[]
  // The header row first.
  table: Table
  // The last row is a total, shown bold.
  totalRow?: boolean
}

export type SheetOptions = {
  // Include each order's customer name.
  names: boolean
}

// Amounts go as numbers in the currency's main unit, so the sheet can sum
// them.
const major = (kobo: number | null) => (kobo === null ? '' : kobo / 100)

const up = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// A day as Sheets counts them (from 30 December 1899), so it shows as a real
// date the vendor can sort and filter.
export function sheetDay(iso: string): Cell {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 + 25_569
}

export function ordersTable(
  orders: Order[],
  credits: Credit[],
  day: (o: Order) => string,
  name: (customerId: string | null) => string,
  opts: SheetOptions,
): SheetTab {
  const head = [
    'Date',
    'Order',
    ...(opts.names ? ['Customer'] : []),
    'Items',
    'Total',
    'Paid',
    'Still owed',
    'Payment',
    'Delivery',
    'Where',
  ]
  const kinds: Kind[] = [
    'date',
    'order',
    ...(opts.names ? (['text'] as const) : []),
    'long',
    'money',
    'money',
    'money',
    'text',
    'text',
    'text',
  ]
  const rows = [...orders]
    .sort(
      (a, b) => day(a).localeCompare(day(b)) || Number(a.code) - Number(b.code),
    )
    .map((o) => {
      const owed = balanceKobo(o, credits)
      return [
        sheetDay(day(o)),
        Number(o.code) || o.code,
        ...(opts.names ? [name(o.customerId)] : []),
        o.items.map((i) => `${i.qty} × ${i.name}`).join(', '),
        major(dueKobo(o)),
        major(paidKobo(o, credits)),
        owed === null ? '' : major(Math.max(0, owed)),
        up(PAYMENT[o.payment.state]),
        up(DELIVERY[o.delivery]),
        up(where(o)),
      ]
    })
  return { title: 'Orders', kinds, table: [head, ...rows] }
}

export function dailyTable(
  orders: Order[],
  credits: Credit[],
  day: (o: Order) => string,
): SheetTab {
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
      sheetDay(d),
      os.length,
      paid.length,
      major(paid.reduce((n, o) => n + paidKobo(o, credits), 0)),
      major(owed),
    ]
  })
  const sum = (i: number) =>
    Math.round(rows.reduce((n, r) => n + Number(r[i] ?? 0), 0) * 100) / 100
  return {
    title: 'Daily totals',
    kinds: ['date', 'count', 'count', 'money', 'money'],
    table: [
      ['Date', 'Orders', 'Paid orders', 'Money in', 'Still owed'],
      ...rows,
      ['Total', sum(1), sum(2), sum(3), sum(4)],
    ],
    totalRow: true,
  }
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

// A cell as the sheet will show it.
export function shown(cell: Cell, kind: Kind, symbol: string): string {
  if (typeof cell !== 'number') return cell
  if (kind === 'date') {
    // As the sheet's "ddd d mmm yyyy" shows it, with no comma.
    return DAY_FORMAT.format(new Date((cell - 25_569) * 86_400_000)).replace(
      ',',
      '',
    )
  }
  if (kind === 'order') return `#${cell}`
  if (kind === 'money') {
    return `${symbol}${cell.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
  }
  return String(cell)
}

// The approval dialog shows the tables as they will read in the sheet.
export function tableText(tab: SheetTab, symbol: string): string {
  return [
    tab.title,
    ...tab.table.map((r, i) =>
      r
        .map((c, j) => (i === 0 ? String(c) : shown(c, tab.kinds[j] ?? 'text', symbol)))
        .join(' | '),
    ),
  ].join('\n')
}
