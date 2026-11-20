import { describe, expect, it } from 'vitest'
import type { Credit } from '../verify/types'
import { moneyFlow } from './flow'
import { newOrder } from './ledger'
import type { Order, Settlement } from './types'

const credit = (
  id: string,
  bank: string | null,
  direction: Credit['direction'],
  naira: number,
  at: string | null,
): Credit => ({
  id,
  bank,
  direction,
  reversal: false,
  amountKobo: naira * 100,
  sender: '',
  narration: '',
  sessionId: null,
  reference: null,
  at: at ? { ms: Date.parse(`${at}Z`), precision: 'second' } : null,
  source: 'alert',
  strength: 'alert received',
})

const credits = [
  credit('a', 'gtbank', 'credit', 18_500, '2026-11-21T11:02:00'),
  credit('b', 'opay', 'credit', 5_000, '2026-11-21T15:20:00'),
  credit('c', 'gtbank', 'debit', 5_000, '2026-11-21T16:00:00'),
  credit('d', 'gtbank', 'credit', 9_000, '2026-11-20T09:00:00'),
  credit('e', null, 'credit', 1_000, null),
]

function paidWith(creditId: string, topUp?: string): Order {
  const o = newOrder(
    [],
    { mode: 'everyday', customerId: null, items: [], amountKobo: null },
    0,
  )
  return {
    ...o,
    code: '4',
    payment: {
      ...o.payment,
      state: 'matched',
      creditId,
      topUpIds: topUp ? [topUp] : [],
    },
  }
}

describe('moneyFlow', () => {
  const refund: Settlement = {
    id: 'b',
    creditId: 'b',
    amountKobo: 500_000,
    state: 'refunded',
    customerId: null,
    refundId: 'c',
    decidedBy: 'vendor',
    updatedAt: 0,
  }
  const flow = moneyFlow(credits, [paidWith('a', 'd')], [refund])

  it('groups by day, newest first, undated last', () => {
    expect(flow.map((d) => d.day)).toEqual(['2026-11-21', '2026-11-20', null])
  })

  it('totals money in and out per day and per bank', () => {
    const today = flow[0]!
    expect([today.inKobo, today.outKobo]).toEqual([2_350_000, 500_000])
    expect(
      today.banks.map((b) => [b.bank, b.inKobo, b.outKobo, b.rows.length]),
    ).toEqual([
      ['gtbank', 1_850_000, 500_000, 2],
      ['opay', 500_000, 0, 1],
    ])
  })

  it('lists each bank newest first', () => {
    expect(flow[0]!.banks[0]!.rows.map((r) => r.credit.id)).toEqual(['c', 'a'])
  })

  it('names the order a credit paid and marks refunds', () => {
    const rows = flow.flatMap((d) => d.banks.flatMap((b) => b.rows))
    const by = (id: string) => rows.find((r) => r.credit.id === id)!
    expect(by('a').orderCode).toBe('4')
    expect(by('d').orderCode).toBe('4')
    expect(by('b').orderCode).toBeNull()
    expect(by('c').refund).toBe(true)
  })
})
