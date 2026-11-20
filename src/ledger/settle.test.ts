import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import type { Verdict } from '../verify/match'
import type { Credit, Receipt } from '../verify/types'
import {
  applyVerdict,
  balanceKobo,
  freshCredits,
  matcherLedger,
  newOrder,
} from './ledger'
import {
  applyRefunds,
  extraMoney,
  moreFromPayer,
  settle,
  unclaimedCredits,
} from './settle'
import type { Order } from './types'

// Synthetic payments only. 21 Nov 2026, Lagos wall-clock.
const at = (h: number, m: number) => ({
  ms: Date.UTC(2026, 10, 21, h, m),
  precision: 'minute' as const,
})
const NOW = 1_795_000_000_000

const credit = (over: Partial<Credit> = {}): Credit => ({
  id: 'c1',
  bank: 'gtbank',
  direction: 'credit',
  reversal: false,
  amountKobo: 500_000,
  sender: 'OLUWAKEMI JOHNSON',
  narration: '',
  sessionId: null,
  reference: null,
  at: at(15, 20),
  source: 'alert',
  strength: 'alert received',
  ...over,
})

const first = credit()
const second = credit({ id: 'c2', at: at(15, 23) })
const other = credit({ id: 'c3', sender: 'ADAEZE OKAFOR' })
const refund = credit({
  id: 'd1',
  direction: 'debit',
  sender: 'TRF TO OLUWAKEMI JOHNSON',
  at: at(16, 5),
})

const paidBy = (creditId: string): Order => {
  const o = newOrder(
    [],
    {
      mode: 'everyday',
      customerId: '2348000000006',
      items: [],
      amountKobo: 500_000,
    },
    NOW,
  )
  return {
    ...o,
    payment: { ...o.payment, state: 'matched', creditId, decidedBy: 'vendor' },
  }
}

describe('money not tied to an order', () => {
  it('lists credits no order claims, leaving out debits', () => {
    const ledger = matcherLedger(
      [paidBy('c1')],
      [first, second, other, refund],
      config,
    )
    expect(unclaimedCredits(ledger).map((c) => c.id)).toEqual(['c2', 'c3'])
  })

  it("finds a second payment from the same payer, not someone else's", () => {
    const ledger = matcherLedger([paidBy('c1')], [first, second, other], config)
    expect(moreFromPayer(first, ledger, config).map((c) => c.id)).toEqual([
      'c2',
    ])
  })

  it('keeps money being refunded from paying any order', () => {
    const owed = settle(second, 'refund owed', '2348000000006', NOW)
    const ledger = matcherLedger([], [first, second], config, undefined, [owed])
    expect(ledger.credits.map((c) => c.id)).toEqual(['c1'])
    const kept = settle(second, 'kept', '2348000000006', NOW)
    expect(
      matcherLedger([], [first, second], config, undefined, [kept]).credits,
    ).toHaveLength(2)
  })

  it('confirms a refund owed from a matching transfer out', () => {
    const owed = settle(second, 'refund owed', null, NOW)
    expect(
      applyRefunds([owed], [first, second, refund], config, NOW + 1),
    ).toEqual([
      {
        ...owed,
        state: 'refunded',
        refundId: 'd1',
        decidedBy: 'rules',
        updatedAt: NOW + 1,
      },
    ])
  })

  it('does not confirm a refund from a transfer to someone else or before the payment', () => {
    const owed = settle(second, 'refund owed', null, NOW)
    const elsewhere = { ...refund, sender: 'TRF TO ADAEZE OKAFOR' }
    const early = { ...refund, at: at(15, 0) }
    expect(applyRefunds([owed], [second, elsewhere], config, NOW)).toEqual([])
    expect(applyRefunds([owed], [second, early], config, NOW)).toEqual([])
  })

  it('uses one transfer out for one refund only', () => {
    const a = settle(first, 'refund owed', null, NOW)
    const b = settle(second, 'refund owed', null, NOW)
    expect(
      applyRefunds([a, b], [first, second, refund], config, NOW),
    ).toHaveLength(1)
  })
})

describe('freshCredits', () => {
  const sid = '100033261121142035602947318256'

  it('skips a second copy of the same alert under a new email id', () => {
    const original = credit({ sessionId: sid })
    const copy = credit({ id: 'c9', sessionId: sid })
    expect(freshCredits([original], [copy])).toEqual([])
    expect(freshCredits([], [original, copy])).toEqual([original])
  })

  it('skips a copy with the same document number', () => {
    const original = credit({ reference: 'DOC1' })
    expect(
      freshCredits([original], [credit({ id: 'c9', reference: 'DOC1' })]),
    ).toEqual([])
  })

  it('keeps a re-import of the same email, and a reversal sharing the ID', () => {
    const original = credit({ sessionId: sid })
    const reversal = credit({
      id: 'r1',
      direction: 'debit',
      reversal: true,
      sessionId: sid,
    })
    expect(freshCredits([original], [original, reversal])).toEqual([
      original,
      reversal,
    ])
  })
})

describe('short and over payments', () => {
  const order = (amountKobo: number, creditId: string | null): Order => {
    const o = newOrder(
      [],
      { mode: 'everyday', customerId: '2348000000006', items: [], amountKobo },
      NOW,
    )
    return creditId
      ? {
          ...o,
          payment: {
            ...o.payment,
            state: 'matched',
            creditId,
            decidedBy: 'rules',
          },
        }
      : o
  }
  const receipt: Receipt = {
    amountKobo: 50_000,
    sender: 'OLUWAKEMI JOHNSON',
    senderBank: 'palmpay',
    reference: '',
    at: at(15, 40),
    status: 'successful',
  }
  const balance = credit({ id: 'b1', amountKobo: 50_000, at: at(15, 40) })
  const matched = (creditId: string): Verdict => ({
    kind: 'matched',
    creditId,
    notes: [],
  })

  it('works out what is still owed or paid over', () => {
    expect(balanceKobo(order(550_000, 'c1'), [first])).toBe(50_000)
    expect(balanceKobo(order(400_000, 'c1'), [first])).toBe(-100_000)
    expect(balanceKobo(order(500_000, null), [first])).toBeNull()
  })

  it('adds a later payment to a short order as its balance', () => {
    const short = order(550_000, 'c1')
    const next = applyVerdict(
      short,
      receipt,
      matched('b1'),
      [first, balance],
      NOW,
    )!
    expect(next.payment).toMatchObject({ creditId: 'c1', topUpIds: ['b1'] })
    expect(balanceKobo(next, [first, balance])).toBe(0)
    expect(
      matcherLedger([next], [first, balance], config).claimedCredits.get('b1'),
    ).toBe(next.code)
  })

  it("does not call a short payer's next payment extra", () => {
    const short = order(550_000, 'c1')
    const row = extraMoney([short], [first, balance], [], config).find(
      (r) => r.key === 'b1',
    )
    expect(row?.settleable).toBe(false)
  })

  it('never undoes a confirmed payment because a later receipt did not match', () => {
    const paid = order(500_000, 'c1')
    const notYet = { kind: 'not yet credited', reason: '' } as const
    expect(applyVerdict(paid, receipt, notYet, [first], NOW)).toBeNull()
    expect(applyVerdict(paid, receipt, matched('c1'), [first], NOW)).toBeNull()
  })

  it('lists the part paid over as extra, and refunds just that part', () => {
    const over = order(400_000, 'c1')
    const refundPart = credit({
      id: 'd2',
      direction: 'debit',
      amountKobo: 100_000,
      sender: 'TRF TO OLUWAKEMI JOHNSON',
      at: at(16, 0),
    })
    const [row] = extraMoney([over], [first], [], config)
    expect(row).toMatchObject({
      key: 'c1:over',
      amountKobo: 100_000,
      orderCode: over.code,
      settleable: true,
    })
    const owed = settle(first, 'refund owed', null, NOW, {
      id: row!.key,
      amountKobo: row!.amountKobo,
    })
    // The order stays paid by its credit while part of it is refunded.
    expect(
      matcherLedger([], [first], config, undefined, [owed]).credits,
    ).toHaveLength(1)
    expect(
      applyRefunds([owed], [first, refundPart], config, NOW),
    ).toMatchObject([{ id: 'c1:over', state: 'refunded', refundId: 'd2' }])
  })
})
