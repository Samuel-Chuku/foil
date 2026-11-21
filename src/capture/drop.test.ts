import { describe, expect, it } from 'vitest'
import { newOrder } from '../ledger/ledger'
import type { Order, Product } from '../ledger/types'
import {
  dropFacts,
  itemState,
  messageTime,
  roleOf,
  unclaimedFacts,
} from './drop'

const MIN = 60_000
const item: Product = {
  id: 'jacket',
  name: '',
  priceKobo: 800_000,
  qty: 1,
  countedAt: 0,
  updatedAt: 0,
  dropId: 'd1',
  dropNo: 3,
}

function claim(
  id: string,
  claimedMin: number,
  capturedMin: number,
  extra: Partial<Order> = {},
): Order {
  const o = newOrder(
    [],
    {
      mode: 'drop',
      customerId: id,
      items: [{ name: '', qty: 1, priceKobo: 800_000, productId: 'jacket' }],
      amountKobo: 800_000,
    },
    capturedMin * MIN,
  )
  return { ...o, id, claimedAt: claimedMin * MIN, ...extra }
}

const paid = (o: Order, atMin: number): Order => ({
  ...o,
  payment: { ...o.payment, state: 'matched', checkedAt: atMin * MIN },
})

describe('itemState', () => {
  it('is available with no claims', () => {
    expect(itemState(item, [], 30, 0)).toEqual({
      state: 'available',
      released: [],
    })
  })

  it('holds for the first to ask, not the first taken down', () => {
    // Bisi asked first but the vendor captured Ade first.
    const orders = [claim('ade', 2, 3), claim('bisi', 1, 4)]
    const s = itemState(item, orders, 30, 10 * MIN)
    expect(s.state).toBe('held')
    if (s.state === 'held') {
      expect(s.holder.order.id).toBe('bisi')
      expect(s.until).toBe(34 * MIN)
      expect(s.waiting.map((c) => c.order.id)).toEqual(['ade'])
    }
  })

  it('passes to the next in line when a hold runs out', () => {
    const orders = [claim('bisi', 1, 4), claim('ade', 2, 3)]
    const s = itemState(item, orders, 30, 40 * MIN)
    expect(s.state).toBe('held')
    if (s.state === 'held') {
      expect(s.holder.order.id).toBe('ade')
      // Ade's hold starts when Bisi's ended, not when Ade was captured.
      expect(s.until).toBe(64 * MIN)
      expect(s.released.map((c) => c.order.id)).toEqual(['bisi'])
    }
  })

  it('lets the vendor end a hold early', () => {
    const orders = [
      claim('bisi', 1, 4, { releasedAt: 10 * MIN }),
      claim('ade', 2, 3),
    ]
    const s = itemState(item, orders, 30, 12 * MIN)
    expect(s.state === 'held' && s.holder.order.id).toBe('ade')
    expect(s.state === 'held' && s.until).toBe(40 * MIN)
  })

  it('is available again when every hold has run out', () => {
    const s = itemState(item, [claim('bisi', 1, 4)], 30, 60 * MIN)
    expect(s.state).toBe('available')
  })

  it('keeps the holder first while someone else pays out of turn', () => {
    // Ade paid at 20 while Bisi held it until 34.
    const orders = [claim('bisi', 1, 4), paid(claim('ade', 2, 3), 20)]
    const s = itemState(item, orders, 30, 21 * MIN)
    expect(s.state === 'held' && s.holder.order.id).toBe('bisi')
    expect(s.state === 'held' && s.paidWaiting.map((c) => c.order.id)).toEqual([
      'ade',
    ])
    // Bisi does not pay in time, so it goes to Ade, who already paid.
    const after = itemState(item, orders, 30, 35 * MIN)
    expect(after.state === 'paid' && after.buyer.order.id).toBe('ade')
  })

  it('gives it to a late payer whose turn had passed, if nobody else paid', () => {
    // Bisi's hold ended at 34; Ade held it until 64; Bisi paid at 40.
    const orders = [paid(claim('bisi', 1, 4), 40), claim('ade', 2, 3)]
    expect(itemState(item, orders, 30, 50 * MIN).state).toBe('held')
    const s = itemState(item, orders, 30, 65 * MIN)
    expect(s.state === 'paid' && s.buyer.order.id).toBe('bisi')
    expect(s.state === 'paid' && s.late).toBe(true)
  })

  it('lets the holder win over an earlier late payment', () => {
    const orders = [paid(claim('bisi', 1, 4), 40), paid(claim('ade', 2, 3), 50)]
    const s = itemState(item, orders, 30, 55 * MIN)
    expect(s.state === 'paid' && s.buyer.order.id).toBe('ade')
    expect(roleOf(s, 'bisi')).toEqual({ role: 'refund' })
  })

  it('is sold once handed over', () => {
    const orders = [
      { ...paid(claim('ade', 2, 3), 10), delivery: 'collected' as const },
    ]
    expect(itemState(item, orders, 30, 11 * MIN).state).toBe('sold')
  })
})

describe('roleOf and dropFacts', () => {
  const orders = [claim('bisi', 1, 4), claim('ade', 2, 5), claim('chi', 3, 6)]

  it('tells the holder how long they have', () => {
    const s = itemState(item, orders, 30, 10 * MIN)
    const role = roleOf(s, 'bisi')!
    expect(role).toEqual({
      role: 'holder',
      until: 34 * MIN,
      afterRelease: false,
    })
    // At 10 min with the hold ending at 34: 24 minutes left, no clock time.
    const fact = dropFacts('item #3', role, '₦8,000', 10 * MIN)
    expect(fact).toContain('within the next 24 minutes')
    expect(fact).toContain('only payment secures it')
    expect(fact).not.toMatch(/\d{1,2}:\d{2}/)
  })

  it('tells the others their place in line, never who holds it', () => {
    const s = itemState(item, orders, 30, 10 * MIN)
    expect(roleOf(s, 'chi')).toEqual({ role: 'waiting', place: 2 })
    expect(dropFacts('item #3', roleOf(s, 'chi')!, null, 10 * MIN)).not.toMatch(
      /bisi|ade/i,
    )
  })

  it('tells a released holder and the next holder', () => {
    const s = itemState(item, orders, 30, 40 * MIN)
    expect(roleOf(s, 'bisi')).toEqual({ role: 'released' })
    expect(roleOf(s, 'ade')).toMatchObject({
      role: 'holder',
      afterRelease: true,
    })
  })

  it('tells the others once someone has paid', () => {
    const s = itemState(
      item,
      [paid(orders[0]!, 8), orders[1]!, orders[2]!],
      30,
      10 * MIN,
    )
    expect(roleOf(s, 'bisi')).toEqual({ role: 'bought', late: false })
    expect(roleOf(s, 'ade')).toEqual({ role: 'lost' })
  })
})

describe('late payment drafts', () => {
  it('tells a payer waiting on the holder, without naming them', () => {
    const fact = dropFacts(
      'item #3',
      { role: 'paidWaiting', until: 34 * MIN },
      null,
      30 * MIN,
    )
    expect(fact).toContain('held for another customer for up to 4 more minutes')
    expect(fact).toContain('send their money back')
  })
  it('asks a customer who lost to an earlier payer where to refund', () => {
    expect(dropFacts('item #3', { role: 'refund' }, null, 0)).toContain(
      'account number, bank and account name',
    )
  })
  it('offers other free pieces from the drop to someone who missed out', () => {
    expect(
      dropFacts('item #3', { role: 'released' }, null, 0, ['#2 (₦6,500)']),
    ).toContain('still free: #2 (₦6,500)')
  })
})

describe('messageTime', () => {
  it("puts a message's clock time on the day in hand", () => {
    const now = Date.UTC(2026, 10, 21, 16, 10)
    expect(messageTime('15:27', now)).toBe(Date.UTC(2026, 10, 21, 15, 27))
    expect(messageTime('', now)).toBeNull()
  })
})

describe('unclaimedFacts', () => {
  it('offers an available item with its hold, and a held one with a place in line', () => {
    expect(
      unclaimedFacts(
        'item #3',
        { state: 'available', released: [] },
        '₦8,000',
        30,
      ),
    ).toContain('held for them for 30 minutes')
    const held = itemState(item, [claim('bisi', 1, 4)], 30, 10 * MIN)
    expect(unclaimedFacts('item #3', held, null, 30)).toContain(
      'Offer to put them in line',
    )
  })
})
