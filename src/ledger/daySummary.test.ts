import { describe, expect, it } from 'vitest'
import type { DayBooks } from './dayBooks'
import { ownerSummary, statusUpdate } from './daySummary'

const t = (count = 0, kobo = 0) => ({ count, kobo })
const books = (over: Partial<DayBooks> = {}): DayBooks => ({
  day: '2026-11-27',
  orders: 0,
  dropOrders: 0,
  unpriced: 0,
  orderedKobo: 0,
  paid: t(),
  short: t(),
  waiting: t(),
  toCheck: t(),
  moneyInKobo: 0,
  moneyOutKobo: 0,
  notTied: t(),
  refundsOwed: t(),
  refundsSent: t(),
  kept: t(),
  delivery: { toSend: 0, out: 0, done: 0 },
  items: [],
  open: [],
  ...over,
})
const money = (k: number) => `₦${(k / 100).toLocaleString('en-NG')}`
const o = { shop: "Tolu's Closet", dayTitle: 'Friday 27 November', money }

describe('ownerSummary', () => {
  it('says plainly when the day is empty', () => {
    expect(ownerSummary(books(), o)).toBe(
      "Tolu's Closet · Friday 27 November\nNo orders or bank money yet today.",
    )
  })

  it('lists only the lines that have something in them', () => {
    const text = ownerSummary(
      books({
        orders: 3,
        orderedKobo: 2100000,
        moneyInKobo: 1400000,
        paid: t(2, 1400000),
        waiting: t(1, 700000),
        delivery: { toSend: 1, out: 1, done: 0 },
        items: [{ name: 'Plain black cap', qty: 2, kobo: 1400000 }],
      }),
      o,
    )
    expect(text.split('\n')).toEqual([
      "Tolu's Closet · Friday 27 November",
      '3 orders, worth ₦21,000.',
      'Money landed: ₦14,000 for 2 paid orders.',
      'Waiting for payment: 1 (₦7,000).',
      'Deliveries: 1 to send, 1 out, 0 done.',
      'Best seller: 2 × Plain black cap.',
    ])
  })

  it('uses the singular for one', () => {
    const text = ownerSummary(
      books({ orders: 1, orderedKobo: 700000, paid: t(1, 700000) }),
      o,
    )
    expect(text).toContain('1 order, worth ₦7,000.')
    expect(text).toContain('for 1 paid order.')
  })
})

describe('statusUpdate', () => {
  it('thanks customers and names what is left, with no figures', () => {
    const text = statusUpdate({
      shop: "Tolu's Closet",
      orders: 4,
      available: ['Plain black cap', 'Tote bag'],
      soldOut: ['Bucket hat'],
    })
    expect(text).toBe(
      "Thank you to everyone who ordered from Tolu's Closet today!\nStill available: Plain black cap and Tote bag.\nSold out today: Bucket hat.\nSend us a message to order.",
    )
    expect(text).not.toMatch(/₦|\d/)
  })

  it('shortens a long stock list', () => {
    const text = statusUpdate({
      shop: '',
      orders: 0,
      available: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      soldOut: [],
    })
    expect(text).toContain('Still available: a, b, c, d, e, f and more.')
    expect(text.startsWith('We are open for orders.')).toBe(true)
  })
})
