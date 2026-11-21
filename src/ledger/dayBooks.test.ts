import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import type { Credit } from '../verify/types'
import { bookDays, booksText, dayBooks } from './dayBooks'
import { newOrder } from './ledger'
import type { Order, OrderItem, Settlement } from './types'

// Synthetic payments only. Lagos wall-clock.
const at = (d: number, h: number) => ({
  ms: Date.UTC(2026, 10, d, h, 0),
  precision: 'minute' as const,
})

const credit = (
  id: string,
  naira: number,
  d = 21,
  direction: Credit['direction'] = 'credit',
  sender = 'ADAEZE OKAFOR',
): Credit => ({
  id,
  bank: 'gtbank',
  direction,
  reversal: false,
  amountKobo: naira * 100,
  sender,
  narration: '',
  sessionId: null,
  reference: null,
  at: at(d, 12),
  source: 'alert',
  strength: 'alert received',
})

let n = 0
function order(
  naira: number | null,
  state: Order['payment']['state'] = 'awaiting',
  over: Partial<Order> & { creditId?: string } = {},
  items: OrderItem[] = [],
): Order {
  const o = newOrder(
    [],
    {
      mode: 'everyday',
      customerId: null,
      items,
      amountKobo: naira === null ? null : naira * 100,
    },
    0,
  )
  n += 1
  return {
    ...o,
    id: `o${n}`,
    code: String(n),
    ...over,
    payment: {
      ...o.payment,
      state,
      creditId: over.creditId ?? null,
    },
  }
}

const day = (o: Order) => (o.id === 'old' ? '2026-11-20' : '2026-11-21')

const credits = [
  credit('c1', 18_500),
  credit('c2', 5_000),
  credit('c3', 7_000, 21, 'credit', 'BOLA ADE'),
  credit('c4', 7_000, 21, 'debit', 'TRF TO BOLA ADE'),
  credit('c5', 9_000, 20),
]
const orders = [
  order(18_500, 'matched', { creditId: 'c1', delivery: 'out' }, [
    { name: 'Ankara gown', qty: 1, priceKobo: 1_500_000 },
    { name: 'Head wrap', qty: 2, priceKobo: 175_000 },
  ]),
  order(8_000, 'matched', { creditId: 'c2' }, [
    { name: 'head wrap ', qty: 4, priceKobo: 200_000 },
  ]),
  order(12_000),
  order(6_000, 'not yet credited'),
  order(4_000, 'mismatch'),
  order(null),
  order(9_000, 'matched', { id: 'old', creditId: 'c5' }),
]
const settlements: Settlement[] = [
  {
    id: 'c3',
    creditId: 'c3',
    amountKobo: 700_000,
    state: 'refunded',
    customerId: null,
    refundId: 'c4',
    decidedBy: 'vendor',
    updatedAt: 0,
  },
]
const data = { orders, credits, settlements }
const books = dayBooks('2026-11-21', data, config, day)

describe('dayBooks', () => {
  it('counts only the day asked for', () => {
    expect(books.orders).toBe(6)
    expect(books.unpriced).toBe(1)
    expect(books.orderedKobo).toBe(4_850_000)
  })

  it('splits orders by payment state', () => {
    expect(books.paid).toEqual({ count: 1, kobo: 1_850_000 })
    expect(books.short).toEqual({ count: 1, kobo: 300_000 })
    expect(books.waiting).toEqual({ count: 2, kobo: 1_800_000 })
    expect(books.toCheck).toEqual({ count: 1, kobo: 400_000 })
  })

  it('totals bank money and refunds for the day', () => {
    expect(books.moneyInKobo).toBe(3_050_000)
    expect(books.moneyOutKobo).toBe(700_000)
    expect(books.refundsSent).toEqual({ count: 1, kobo: 700_000 })
    expect(books.notTied.count).toBe(0)
  })

  it('tracks paid orders through delivery', () => {
    expect(books.delivery).toEqual({ toSend: 1, out: 1, done: 0 })
  })

  it('adds up items sold on paid orders, matching names loosely', () => {
    expect(books.items).toEqual([
      { name: 'Head wrap', qty: 6, kobo: 1_150_000 },
      { name: 'Ankara gown', qty: 1, kobo: 1_500_000 },
    ])
  })

  it('lists open orders by number and what each still needs', () => {
    expect(books.open.map((o) => [o.dueKobo, o.status])).toEqual([
      [1_850_000, 'paid, out for delivery'],
      [800_000, 'paid in part, ₦3,000 owed, to send'],
      [1_200_000, 'waiting for payment'],
      [600_000, 'not yet credited'],
      [400_000, 'receipt does not match'],
      [null, 'no price yet'],
    ])
  })

  it('lists every day with activity, newest first', () => {
    expect(bookDays(orders, credits, day)).toEqual(['2026-11-21', '2026-11-20'])
  })

  it('gives the cloud totals and never a name', () => {
    const text = booksText(books)
    expect(text).toContain('Fully paid: 1 order, ₦18,500.')
    expect(text).toContain('Paid in part: 1 order, ₦3,000 still owed.')
    expect(text).toMatch(
      /Open orders, by number: order \d+, ₦18,500, paid, out/,
    )
    expect(text).not.toMatch(/ADAEZE|BOLA/i)
  })
})
