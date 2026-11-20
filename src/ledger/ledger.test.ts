import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { verifyReceipt } from '../verify/match'
import type { Credit, Receipt } from '../verify/types'
import {
  customerKey,
  applyReversals,
  confirmCredit,
  matcherLedger,
  newOrder,
  normalisePhone,
  recheckOrders,
  recordVerdict,
  toBookEntry,
  undoCreditPick,
} from './ledger'
import type { Order } from './types'

// Synthetic payments only. 21 Nov 2026, Lagos wall-clock.
const at = (h: number, m: number, s = 0) => Date.UTC(2026, 10, 21, h, m, s)
const OPAY_ID = '100004261121100212000000000123'
const NOW = 1_795_000_000_000

const credit = (over: Partial<Credit> = {}): Credit => ({
  id: 'c1',
  bank: 'gtbank',
  direction: 'credit',
  reversal: false,
  amountKobo: 1_850_000,
  sender: 'ADAEZE OKAFOR',
  narration: '',
  sessionId: null,
  reference: null,
  at: { ms: at(11, 2, 30), precision: 'second' },
  source: 'alert',
  strength: 'alert received',
  ...over,
})

const receipt: Receipt = {
  amountKobo: 1_850_000,
  sender: 'Adaeze Okafor',
  senderBank: 'opay',
  reference: OPAY_ID,
  at: { ms: at(11, 2), precision: 'minute' },
  status: 'successful',
}

const order = (orders: Order[] = []): Order =>
  newOrder(
    orders,
    {
      mode: 'everyday',
      customerId: '2348030000001',
      items: [{ name: 'Ankara gown', qty: 1, priceKobo: 1_850_000 }],
      amountKobo: 1_850_000,
    },
    NOW,
  )

function verify(o: Order, orders: Order[], credits: Credit[]): Order {
  const ledger = matcherLedger(orders, credits, config, o.id)
  return recordVerdict(o, receipt, verifyReceipt(receipt, ledger, config), NOW)
}

describe('normalisePhone', () => {
  it('brings local and international forms to one key', () => {
    expect(normalisePhone('0803 000 0001')).toBe('2348030000001')
    expect(normalisePhone('+234 803-000-0001')).toBe('2348030000001')
    expect(normalisePhone('2348030000001')).toBe('2348030000001')
    expect(normalisePhone('+44 7700 900123')).toBe('447700900123')
    expect(normalisePhone('Ada')).toBeNull()
  })
})

describe('ledger', () => {
  it('numbers orders after the highest code', () => {
    const first = order()
    expect(first.code).toBe('1')
    expect(order([first, { ...first, code: '7' }]).code).toBe('8')
  })

  it('records a match with its credit and session ID', () => {
    const o = verify(order(), [], [credit()])
    expect(o.payment).toMatchObject({
      state: 'matched',
      creditId: 'c1',
      sessionId: OPAY_ID,
      decidedBy: 'rules',
    })
  })

  it('re-checking a paid order does not trip over its own receipt', () => {
    const paid = verify(order(), [], [credit()])
    expect(verify(paid, [paid], [credit()]).payment.state).toBe('matched')
  })

  it('the same receipt cannot pay a second order', () => {
    const paid = verify(order(), [], [credit()])
    const second = verify(order([paid]), [paid], [credit()])
    expect(second.payment.state).toBe('mismatch')
    expect(second.payment.reason).toContain('order 1')
    expect(second.payment.creditId).toBeNull()
  })

  it('lets the vendor settle a check, but not with a claimed credit', () => {
    const paid = verify(order(), [], [credit()])
    const other = order([paid])
    const ledger = matcherLedger([paid, other], [credit()], config, other.id)
    expect(confirmCredit(other, 'c1', ledger, NOW)).toEqual({
      ok: false,
      reason: 'That credit already pays for order 1.',
    })
    const free = matcherLedger([other], [credit()], config, other.id)
    const done = confirmCredit(other, 'c1', free, NOW)
    expect(done.ok && done.order.payment).toMatchObject({
      state: 'matched',
      decidedBy: 'vendor',
    })
  })

  it('a later reversal unpays the order', () => {
    const paid = verify(order(), [], [credit()])
    const credits = [
      credit(),
      credit({
        id: 'r1',
        direction: 'debit',
        reversal: true,
        at: { ms: at(12, 0), precision: 'second' },
      }),
    ]
    const ledger = matcherLedger([paid], credits, config)
    const [changed] = applyReversals([paid], ledger.reversedCredits, NOW)
    expect(changed?.payment.state).toBe('mismatch')
  })
})

describe('toBookEntry', () => {
  it('carries amounts and states, never people', () => {
    const entry = toBookEntry(verify(order(), [], [credit()]))
    expect(Object.keys(entry).sort()).toEqual(
      [
        'amountKobo',
        'createdAt',
        'decidedBy',
        'delivery',
        'mode',
        'orderId',
        'paidAt',
        'payment',
        'updatedAt',
      ].sort(),
    )
    const text = JSON.stringify(entry)
    expect(text).not.toContain('2348030000001')
    expect(text).not.toContain('Ankara')
    expect(text).not.toContain(OPAY_ID)
    expect(entry.paidAt).toBe(NOW)
  })
})

describe('undo', () => {
  it("undoes the vendor's credit pick and frees the credit", () => {
    const o = {
      ...order(),
      payment: {
        ...order().payment,
        state: 'check' as const,
        candidates: ['c1', 'c2'],
      },
    }
    const picked = confirmCredit(
      o,
      'c1',
      matcherLedger([], [credit()], config),
      NOW,
    )
    if (!picked.ok) throw new Error(picked.reason)
    const undone = undoCreditPick(picked.order, NOW + 1)!
    expect(undone.payment).toMatchObject({
      state: 'check',
      creditId: null,
      candidates: ['c1', 'c2'],
      decidedBy: 'rules',
    })
    expect(toBookEntry(undone).paidAt).toBeNull()
    expect(
      matcherLedger([undone], [credit()], config).claimedCredits.size,
    ).toBe(0)
  })

  it('leaves decisions made by the rules alone', () => {
    const matched = verify(order(), [], [credit({ sessionId: OPAY_ID })])
    expect(matched.payment.state).toBe('matched')
    expect(undoCreditPick(matched, NOW)).toBeNull()
  })
})

describe('recheckOrders', () => {
  it('turns a waiting order paid once its credit arrives', () => {
    const waiting = verify(order(), [], [])
    expect(waiting.payment.state).toBe('not yet credited')
    expect(waiting.receipt).toEqual(receipt)
    expect(recheckOrders([waiting], [], config, [], NOW)).toEqual([])
    const [paid] = recheckOrders([waiting], [credit()], config, [], NOW + 1)
    expect(paid?.payment).toMatchObject({ state: 'matched', creditId: 'c1' })
  })

  it('gives one credit to the older of two waiting orders', () => {
    const older = verify(order(), [], [])
    const newer = { ...verify(order([older]), [], []), createdAt: NOW + 5 }
    const changed = recheckOrders([newer, older], [credit()], config, [], NOW)
    expect(changed.map((o) => [o.id, o.payment.state])).toEqual([
      [older.id, 'matched'],
      [newer.id, 'mismatch'],
    ])
  })

  it('leaves paid orders and orders the vendor decided alone', () => {
    const paid = verify(order(), [], [credit()])
    const decided = {
      ...verify(order(), [], []),
      payment: {
        ...verify(order(), [], []).payment,
        decidedBy: 'vendor' as const,
      },
    }
    expect(recheckOrders([paid, decided], [credit()], config, [], NOW)).toEqual(
      [],
    )
  })
})

describe('customerKey', () => {
  it('files a chat under its number, or a saved contact under its name', () => {
    expect(customerKey('+234 800 000 0011')).toBe('2348000000011')
    expect(customerKey('name:Tola')).toBe('name:Tola')
    expect(customerKey('Tola')).toBeNull()
  })
})
