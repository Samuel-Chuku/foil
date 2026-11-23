import { describe, expect, it } from 'vitest'
import { EMPTY_RULES } from '../capture/shopRules'
import { newOrder } from './ledger'
import { lookupPreview, runTool, TOOLS, type DeskData } from './tools'
import type { Credit } from '../verify/types'
import type { Order, Product } from './types'

// Synthetic records only.
const order = (code: string, over: Partial<Order> = {}): Order => ({
  ...newOrder(
    [],
    {
      mode: 'everyday',
      customerId: '2348000000001',
      items: [{ name: 'Headwrap', qty: 2, priceKobo: 350_000 }],
      amountKobo: 700_000,
    },
    0,
  ),
  code,
  ...over,
})

const paid = (code: string, delivery: Order['delivery'] = 'pending') => {
  const o = order(code)
  return {
    ...o,
    payment: { ...o.payment, state: 'matched' as const, creditId: 'c1' },
    delivery,
  }
}

const product: Product = {
  id: 'p1',
  name: 'Headwrap',
  priceKobo: 350_000,
  qty: 12,
  countedAt: 0,
  updatedAt: 0,
}

const desk = (orders: Order[]): DeskData => ({
  orders,
  // One credit that covers any paid order in full; only its amount is read.
  credits: [{ id: 'c1', amountKobo: 700_000 } as Credit],
  products: [product],
  drops: [],
  settlements: [],
  chats: [],
  rules: EMPTY_RULES,
  books: 'Books: 2 orders.',
  trends: 'Trends: up.',
  now: 0,
})

describe('desk tools', () => {
  const d = desk([order('3'), paid('1'), paid('2', 'out')])

  it('lists orders in one group by number', () => {
    const r = runTool('list_orders', { which: 'unpaid' }, d)
    expect(r.text).toContain('Order 3')
    expect(r.text).not.toContain('Order 1;')
    expect(r.step).toBe('Looked up unpaid orders (1)')
    expect(runTool('list_orders', { which: 'to_send' }, d).text).toContain(
      'Order 1',
    )
  })

  it('treats bad arguments as a plain miss, not an error', () => {
    expect(runTool('order_details', { number: '#99' }, d).text).toBe(
      'There is no order 99.',
    )
    expect(runTool('list_orders', { which: 'everything' }, d).step).toContain(
      'all open orders',
    )
    expect(runTool('nope', {}, d).text).toContain('no tool')
    expect(runTool('order_details', null, d).text).toContain('no order')
  })

  it('offers a delivery step only when the desk itself would', () => {
    const ok = runTool('suggest_delivery_step', { number: '1', step: 'out' }, d)
    expect(ok.proposal).toMatchObject({
      kind: 'delivery',
      code: '1',
      to: 'out',
    })
    // Unpaid orders are never offered for sending.
    const no = runTool('suggest_delivery_step', { number: '3', step: 'out' }, d)
    expect(no.proposal).toBeUndefined()
    // Out for delivery can be marked delivered, not sent out again.
    expect(
      runTool('suggest_delivery_step', { number: '2', step: 'out' }, d)
        .proposal,
    ).toBeUndefined()
    expect(
      runTool('suggest_delivery_step', { number: '2', step: 'delivered' }, d)
        .proposal,
    ).toMatchObject({ to: 'delivered' })
  })

  it('names a chart only from the known list', () => {
    expect(runTool('show_chart', { chart: 'top-items' }, d).chart).toBe(
      'top-items',
    )
    expect(runTool('show_chart', { chart: 'pie' }, d).chart).toBeUndefined()
  })

  it('never returns a customer phone number', () => {
    for (const t of TOOLS) {
      const r = runTool(t.name, { number: '1', which: 'all_open' }, d)
      expect(r.text).not.toContain('2348000000001')
    }
    expect(lookupPreview(d)).not.toContain('2348000000001')
  })

  it('previews every lookup the cloud could be sent', () => {
    const preview = lookupPreview(d)
    for (const code of ['1', '2', '3'])
      expect(preview).toContain(`Order ${code}`)
    expect(preview).toContain('Books: 2 orders.')
    expect(preview).toContain('Headwrap')
  })
})

describe('tool menu', () => {
  it('declares every parameter the tools read', () => {
    for (const t of TOOLS) {
      for (const k of Object.keys(t.params)) {
        expect(['which', 'number', 'product', 'chart', 'step']).toContain(k)
      }
    }
  })
})
