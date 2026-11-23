import { describe, expect, it } from 'vitest'
import { newOrder } from '../ledger/ledger'
import type { Order } from '../ledger/types'
import type { Credit } from '../verify/types'
import { atTime, deliveryRunEvent, nextHour } from './calendar'
import { dailyTable, ordersTable, sheetDay, shown, tableText } from './sheet'

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
const paid = (code: string) => {
  const o = order(code)
  return {
    ...o,
    payment: { ...o.payment, state: 'matched' as const, creditId: 'c1' },
  }
}
const credits = [{ id: 'c1', amountKobo: 700_000 } as Credit]
const day = () => '2026-11-21'
const name = () => 'Ada'

describe('orders sheet', () => {
  it('writes dates and amounts as numbers and leaves names out by default', () => {
    const t = ordersTable([order('2'), paid('1')], credits, day, name, {
      names: false,
    })
    expect(t.table[0]).not.toContain('Customer')
    expect(t.table[1]).toEqual([
      sheetDay('2026-11-21'),
      1,
      '2 × Headwrap',
      7000,
      7000,
      0,
      'Paid',
      'Not sent yet',
      'Delivery not discussed',
    ])
    expect(t.table[2]![5]).toBe('')
    expect(t.kinds).toHaveLength(t.table[0]!.length)
    expect(tableText(t, '₦')).not.toContain('2348000000001')
  })

  it('adds names only when asked, never phone numbers', () => {
    const t = ordersTable([paid('1')], credits, day, name, { names: true })
    expect(t.table[0]![2]).toBe('Customer')
    expect(t.table[1]![2]).toBe('Ada')
    expect(JSON.stringify(t)).not.toContain('2348000000001')
  })

  it('totals each day, then all days', () => {
    const t = dailyTable([order('2'), paid('1')], credits, day)
    expect(t.table).toEqual([
      ['Date', 'Orders', 'Paid orders', 'Money in', 'Still owed'],
      [sheetDay('2026-11-21'), 2, 1, 7000, 7000],
      ['Total', 2, 1, 7000, 7000],
    ])
    expect(t.totalRow).toBe(true)
  })

  it('counts days the way Sheets does', () => {
    expect(sheetDay('1899-12-31')).toBe(1)
    expect(sheetDay('2026-11-21')).toBe(46_347)
    expect(sheetDay('soon')).toBe('soon')
  })

  it('shows the approval exactly as the sheet will read', () => {
    const t = ordersTable([paid('1')], credits, day, name, { names: false })
    expect(tableText(t, '₦').split('\n')[2]).toBe(
      'Sat 21 Nov 2026 | #1 | 2 × Headwrap | ₦7,000 | ₦7,000 | ₦0 | Paid | Not sent yet | Delivery not discussed',
    )
    expect(shown(1500.5, 'money', '₦')).toBe('₦1,500.5')
  })
})

describe('calendar events', () => {
  const start = Date.UTC(2026, 10, 21, 15, 0)

  it('plans a delivery run in the shop’s time zone, without phones', () => {
    const e = deliveryRunEvent({
      area: 'Yaba',
      orders: [paid('1')],
      startMs: start,
      minutes: 90,
      timeZone: 'Africa/Lagos',
    })
    expect(e.summary).toBe('Deliveries: Yaba (1)')
    expect(e.start).toEqual({
      dateTime: '2026-11-21T15:00:00',
      timeZone: 'Africa/Lagos',
    })
    expect(e.end.dateTime).toBe('2026-11-21T16:30:00')
    expect(e.description).toContain('#1: 2 x Headwrap')
    expect(e.description).not.toContain('2348000000001')
  })

  it('reads a typed time on the day', () => {
    expect(atTime(start, '09:30')).toBe(Date.UTC(2026, 10, 21, 9, 30))
    expect(atTime(start, '25:00')).toBeNull()
    expect(atTime(start, 'soon')).toBeNull()
    expect(nextHour(Date.UTC(2026, 10, 21, 14, 20))).toBe(start)
  })
})
