import { describe, expect, it } from 'vitest'
import { EMPTY_RULES } from '../capture/shopRules'
import { newOrder } from './ledger'
import {
  businessText,
  openOrderLines,
  stockLines,
  waitingLine,
} from './snapshot'
import type { ChatNote, Order, Product } from './types'

// Synthetic records only.
const order = (code: string, over: Partial<Order> = {}): Order => {
  const o = newOrder(
    [],
    {
      mode: 'everyday',
      customerId: '2348000000001',
      items: [{ name: 'Headwrap', qty: 2, priceKobo: 350_000 }],
      amountKobo: 700_000,
    },
    0,
  )
  return { ...o, code, ...over }
}

const product: Product = {
  id: 'p1',
  name: 'Headwrap',
  priceKobo: 350_000,
  qty: 12,
  countedAt: 0,
  updatedAt: 0,
}

describe('business snapshot', () => {
  it('lists open orders by number with items, money and delivery', () => {
    const lines = openOrderLines(
      [
        order('2'),
        order('1', {
          deliveryPlan: {
            method: 'own-rider',
            area: 'Yaba',
            state: '',
            park: '',
            feeKobo: 150_000,
            paidTo: 'rider',
          },
        }),
      ],
      [],
    )
    expect(lines).toEqual([
      'Order 1; 2 x Headwrap; ₦7,000; waiting for payment; delivery to Yaba; not sent yet',
      'Order 2; 2 x Headwrap; ₦7,000; waiting for payment; delivery not discussed; not sent yet',
    ])
  })

  it('counts stock left after paid orders', () => {
    expect(stockLines([product], [])).toEqual(['Headwrap: ₦3,500, 12 left'])
  })

  it('counts who is waiting by type, never by name', () => {
    const chat = (label: ChatNote['label']): ChatNote => ({
      id: 'x',
      name: 'Sample Customer',
      recent: [],
      lastFrom: 'customer',
      readAt: 0,
      label,
    })
    expect(waitingLine([chat('complaint'), chat('order'), chat('order')])).toBe(
      '3 customers are waiting for a reply: 1 complaint, 2 order.',
    )
  })

  it('never carries a customer name, phone or address', () => {
    const text = businessText({
      books: 'Books.',
      trends: 'Trends.',
      orders: [order('1')],
      credits: [],
      products: [product],
      drops: [],
      settlements: [],
      chats: [],
      rules: EMPTY_RULES,
      now: 0,
    })
    expect(text).not.toMatch(/2348000000001|Sample Customer/)
    expect(text).toContain('Open orders, by number (1):')
  })
})
