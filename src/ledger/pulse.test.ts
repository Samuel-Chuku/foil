import { describe, expect, it } from 'vitest'
import type { Credit } from '../verify/types'
import { newOrder } from './ledger'
import { moneyPulse } from './pulse'
import type { Order } from './types'

const credit = (
  id: string,
  direction: Credit['direction'],
  naira: number,
  at: string | null,
  reversal = false,
): Credit => ({
  id,
  bank: 'gtbank',
  direction,
  reversal,
  amountKobo: naira * 100,
  sender: '',
  narration: '',
  sessionId: null,
  reference: null,
  at: at ? { ms: Date.parse(`${at}Z`), precision: 'second' } : null,
  source: 'alert',
  strength: 'alert received',
})

const now = Date.parse('2026-11-21T14:00:00Z')

const credits = [
  credit('a', 'credit', 18_500, '2026-11-21T11:02:00'),
  credit('b', 'credit', 5_000, '2026-11-21T13:20:00'),
  credit('c', 'debit', 3_000, '2026-11-21T13:40:00'),
  // Later than "now" on the sample clock: not arrived yet.
  credit('d', 'credit', 7_000, '2026-11-21T15:00:00'),
  credit('e', 'credit', 4_000, '2026-11-21T12:00:00', true),
  // Last week: only what had arrived by 14:00 is compared.
  credit('f', 'credit', 10_000, '2026-11-14T10:00:00'),
  credit('g', 'credit', 50_000, '2026-11-14T18:00:00'),
  credit('h', 'credit', 2_000, '2026-11-19T09:00:00'),
  credit('u', 'credit', 1_000, null),
]

function paidWith(creditId: string): Order {
  const o = newOrder(
    [],
    { mode: 'everyday', customerId: null, items: [], amountKobo: null },
    0,
  )
  return {
    ...o,
    code: '73',
    payment: { ...o.payment, state: 'matched', creditId },
  }
}

describe('moneyPulse', () => {
  const pulse = moneyPulse(credits, [paidWith('a')], [], now, 7)

  it('totals today so far, leaving out reversals and later alerts', () => {
    expect(pulse.today.in.kobo).toBe(2_350_000)
    expect(pulse.today.out.kobo).toBe(300_000)
  })

  it('compares with the same day last week up to the same time', () => {
    expect(pulse.today.in.lastWeekKobo).toBe(1_000_000)
    expect(pulse.today.in.change).toBeCloseTo(1.35)
  })

  it('has no change when last week had nothing to compare', () => {
    expect(pulse.today.out.change).toBeNull()
  })

  it('runs the chosen number of days, ending today', () => {
    expect(pulse.days.map((d) => d.day)).toEqual([
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
    ])
    expect(pulse.days[4]!.inKobo).toBe(200_000)
    expect(pulse.days[6]).toMatchObject({ inKobo: 2_350_000, outKobo: 300_000 })
  })

  it('lists the latest dated alerts, newest first, with their orders', () => {
    expect(pulse.latest.map((r) => r.credit.id).slice(0, 4)).toEqual([
      'c',
      'b',
      'e',
      'a',
    ])
    expect(pulse.latest.find((r) => r.credit.id === 'a')?.orderCode).toBe('73')
    expect(pulse.newestMs).toBe(Date.parse('2026-11-21T13:40:00Z'))
  })

  it('keeps the feed to its size', () => {
    expect(moneyPulse(credits, [], [], now, 7, 2).latest).toHaveLength(2)
  })
})
