import { describe, expect, it } from 'vitest'
import { EMPTY_RULES } from '../capture/shopRules'
import { MARKETS } from '../config/market'
import { newOrder } from './ledger'
import {
  answerLines,
  repairOrderNumbers,
  businessText,
  DEVICE_ASK_MAX_CHARS,
  deviceAskPrompt,
  openOrderLines,
  stockLines,
  waitingLine,
  repairAmounts,
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

describe('deviceAskPrompt', () => {
  it('carries the facts, the last three exchanges and the question', () => {
    const history = [1, 2, 3, 4].map((n) => ({
      question: `q${n}`,
      answer: `a${n}`,
    }))
    const p = deviceAskPrompt('Rules.', 'Charts.', 'Facts.', history, 'Now?')!
    expect(p).toContain('Facts.')
    expect(p).not.toContain('q1')
    expect(p).toContain('Owner asked: q4\nYou answered: a4')
    expect(p.endsWith('Question: Now?')).toBe(true)
  })

  it('declines a request too long for the device', () => {
    expect(
      deviceAskPrompt('', '', 'x'.repeat(DEVICE_ASK_MAX_CHARS), [], 'Now?'),
    ).toBeNull()
  })
})

describe('answerLines', () => {
  it('works out unpaid, to-send and stock answers in code', () => {
    const paid = order('3', {})
    const lines = answerLines(
      [
        order('2'),
        {
          ...paid,
          payment: { ...paid.payment, state: 'matched', creditId: 'cr' },
        },
        order('1'),
      ],
      [
        {
          id: 'cr',
          bank: null,
          direction: 'credit',
          reversal: false,
          amountKobo: 700_000,
          sender: '',
          narration: '',
          sessionId: null,
          reference: null,
          at: null,
          source: 'alert',
          strength: 'alert received',
        },
      ],
      [{ ...product, qty: 2 }],
    )
    expect(lines[0]).toBe(
      'Unpaid or part-paid orders still open, by number: #1, #2.',
    )
    expect(lines[1]).toBe('Paid orders still to send out: #3.')
    // Order 3 is paid for the two headwraps the shop counted.
    expect(lines[2]).toBe('Sold out: Headwrap. Running low: nothing.')
  })
})

describe('repairOrderNumbers', () => {
  it('splits a merged pair back into two real orders', () => {
    const codes = ['69', '71', '78', '80', '83']
    expect(repairOrderNumbers('Orders #69, #71, #780, #83.', codes)).toBe(
      'Orders #69, #71, #78, #80, #83.',
    )
  })

  it('splits two orders written side by side', () => {
    expect(repairOrderNumbers('Send #7781.', ['77', '81'])).toBe(
      'Send #77, #81.',
    )
  })

  it('leaves real orders and unknowable numbers alone', () => {
    expect(repairOrderNumbers('Order #71 and #999.', ['71'])).toBe(
      'Order #71 and #999.',
    )
  })
})

describe('repairAmounts', () => {
  const records =
    'Fully paid ₦396,000 (up 10%). Worth ₦478,000. Money in ₦472,000.'
  const ng = MARKETS.ng

  it('drops a stray digit to give back the amount in the records', () => {
    expect(
      repairAmounts('Paid orders were ₦396,0000, up 10%.', records, ng),
    ).toBe('Paid orders were ₦396,000, up 10%.')
  })

  it('leaves well-formed amounts alone, even ones worked out', () => {
    const said = 'That is ₦18,000 more than last week, and ₦472,000 in all.'
    expect(repairAmounts(said, records, ng)).toBe(said)
  })

  it('changes nothing without exactly one match', () => {
    expect(repairAmounts('About ₦12,34567.', records, ng)).toBe(
      'About ₦12,34567.',
    )
    expect(repairAmounts('₦47,8000', 'Worth ₦478,000 and ₦47,800.', ng)).toBe(
      '₦47,8000',
    )
  })

  it('follows each market’s way of writing numbers', () => {
    expect(
      repairAmounts('Paid ₹1,00,0000.', 'Paid ₹1,00,000.', MARKETS.in),
    ).toBe('Paid ₹1,00,000.')
    expect(repairAmounts('Pago R$ 3.9600.', 'Pago R$ 3.960.', MARKETS.br)).toBe(
      'Pago R$ 3.960.',
    )
  })
})

describe('repairAmounts, grouping only', () => {
  it('regroups digits that match one amount in the records', () => {
    expect(
      repairAmounts('In ₦4720,00 today.', 'Money in ₦472,000.', MARKETS.ng),
    ).toBe('In ₦472,000 today.')
  })
})
