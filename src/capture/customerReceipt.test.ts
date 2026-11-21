import { describe, expect, it } from 'vitest'
import { newOrder } from '../ledger/ledger'
import type { DeliveryPlan, Order } from '../ledger/types'
import type { Credit } from '../verify/types'
import { receiptFor, receiptText, receiptTime } from './customerReceipt'

// Synthetic payments only. Lagos wall-clock.
const credit = (id: string, naira: number, h: number, m: number): Credit => ({
  id,
  bank: 'gtbank',
  direction: 'credit',
  reversal: false,
  amountKobo: naira * 100,
  sender: 'ADAEZE OKAFOR',
  narration: '',
  sessionId: id === 'c1' ? '000013261121154200009934417' : null,
  reference: null,
  at: { ms: Date.UTC(2026, 10, 21, h, m), precision: 'minute' },
  source: 'alert',
  strength: 'alert received',
})

const plan = (paidTo: DeliveryPlan['paidTo']): DeliveryPlan => ({
  method: 'own-rider',
  area: 'Lekki',
  state: '',
  park: '',
  feeKobo: 300_000,
  paidTo,
})

function order(
  state: Order['payment']['state'],
  deliveryPlan: DeliveryPlan | null,
  topUps: string[] = [],
): Order {
  const o = newOrder(
    [],
    {
      mode: 'everyday',
      customerId: null,
      items: [
        { name: 'Headwrap', qty: 2, priceKobo: 350_000 },
        { name: 'Ankara gown', qty: 1, priceKobo: 1_500_000 },
      ],
      amountKobo: 2_200_000,
      deliveryPlan,
    },
    0,
  )
  return {
    ...o,
    code: '81',
    payment: { ...o.payment, state, creditId: 'c1', topUpIds: topUps },
  }
}

const credits = [credit('c1', 25_000, 15, 42), credit('c2', 5_000, 16, 5)]

describe('receiptFor', () => {
  it('waits until the money has landed', () => {
    expect(
      receiptFor(order('awaiting', null), credits, 'Shop', null),
    ).toBeNull()
    expect(receiptFor(order('check', null), credits, 'Shop', null)).toBeNull()
  })

  it('lists items, a delivery fee paid to the shop, and the transfer ref', () => {
    const r = receiptFor(
      order('matched', plan('shop')),
      credits,
      "Tolu's Closet",
      'Adaeze',
    )!
    expect(r.lines).toEqual([
      { label: '2 x Headwrap', kobo: 700_000 },
      { label: '1 x Ankara gown', kobo: 1_500_000 },
      { label: 'Delivery to Lekki', kobo: 300_000 },
    ])
    expect([r.totalKobo, r.paidKobo, r.owedKobo]).toEqual([
      2_500_000, 2_500_000, 0,
    ])
    expect(r.refEnding).toBe('934417')
    expect(receiptTime(r.paidAt!)).toBe('Sat 21 Nov, 3:42 PM')
  })

  it('notes a fee the rider collects instead of adding it', () => {
    const r = receiptFor(order('matched', plan('rider')), credits, '', null)!
    expect(r.lines).toHaveLength(2)
    expect(r.riderNote).toBe('Delivery fee of ₦3,000 is paid to the rider.')
  })

  it('shows what is still owed on a part payment, and the latest time', () => {
    const short = { ...credits[0]!, amountKobo: 1_500_000 }
    const r = receiptFor(
      order('matched', plan('shop')),
      [short, credits[1]!],
      '',
      null,
    )!
    expect(r.owedKobo).toBe(1_000_000)
    const both = receiptFor(
      order('matched', plan('shop'), ['c2']),
      [short, credits[1]!],
      '',
      null,
    )!
    expect(both.owedKobo).toBe(500_000)
    expect(receiptTime(both.paidAt!)).toBe('Sat 21 Nov, 4:05 PM')
  })
})

describe('receiptText', () => {
  it('reads as one WhatsApp message', () => {
    const r = receiptFor(
      order('matched', plan('shop')),
      credits,
      "Tolu's Closet",
      null,
    )!
    expect(receiptText(r)).toBe(
      [
        '*Payment received* ✅',
        "Tolu's Closet · Order 81",
        'Sat 21 Nov, 3:42 PM',
        '',
        '2 x Headwrap: ₦7,000',
        '1 x Ankara gown: ₦15,000',
        'Delivery to Lekki: ₦3,000',
        '*Total: ₦25,000*',
        '*Paid: ₦25,000*',
        'Transfer ref ending 934417',
        '',
        "Thank you for shopping with Tolu's Closet!",
      ].join('\n'),
    )
  })

  it('never calls anything fake', () => {
    const r = receiptFor(order('matched', null), credits, '', null)!
    expect(receiptText(r)).not.toMatch(/fake|fraud|verified/i)
  })
})
