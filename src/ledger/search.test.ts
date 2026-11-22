import { describe, expect, it } from 'vitest'
import { newOrder } from './ledger'
import { findOrders } from './search'
import type { Customer, Order } from './types'

// Synthetic records only.
const customers: Customer[] = [
  {
    id: '2348000000001',
    name: 'Sample Ada',
    address: '',
    landmark: '',
    area: '',
    updatedAt: 0,
  },
  {
    id: '2348000000002',
    name: 'Sample Bayo',
    address: '',
    landmark: '',
    area: '',
    updatedAt: 0,
  },
]
const order = (
  code: string,
  customerId: string,
  item: string,
  at: number,
): Order => ({
  ...newOrder(
    [],
    {
      mode: 'everyday',
      customerId,
      items: [{ name: item, qty: 1, priceKobo: 100_000 }],
      amountKobo: 100_000,
    },
    at,
  ),
  code,
})
const orders = [
  order('12', '2348000000001', 'Ankara gown', 1),
  order('7', '2348000000002', 'Headwrap', 2),
  order('120', '2348000000001', 'Headwrap', 3),
]
const codes = (q: string) => findOrders(orders, customers, q).map((o) => o.code)

describe('findOrders', () => {
  it('matches an order number exactly, with or without #', () => {
    expect(codes('12')).toEqual(['12'])
    expect(codes('#7')).toEqual(['7'])
  })

  it('matches a name, an item or part of a phone number, newest first', () => {
    expect(codes('ada')).toEqual(['120', '12'])
    expect(codes('headwrap')).toEqual(['120', '7'])
    expect(codes('0800 000 0002')).toEqual(['7'])
  })

  it('finds nothing for an empty search', () => {
    expect(codes('  ')).toEqual([])
  })
})
