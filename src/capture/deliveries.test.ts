import { describe, expect, it } from 'vitest'
import { newOrder } from '../ledger/ledger'
import type { DeliveryPlan, Order } from '../ledger/types'
import { deliveryGroups, nextSteps } from './deliveries'

// Synthetic orders only.
const plan = (over: Partial<DeliveryPlan>): DeliveryPlan => ({
  method: 'own-rider',
  area: '',
  state: '',
  park: '',
  feeKobo: null,
  paidTo: null,
  ...over,
})

function order(
  code: string,
  over: Partial<Order> = {},
  state: Order['payment']['state'] = 'matched',
): Order {
  const o = newOrder(
    [],
    { mode: 'everyday', customerId: null, items: [], amountKobo: 500_000 },
    0,
  )
  return { ...o, code, ...over, payment: { ...o.payment, state } }
}

describe('nextSteps', () => {
  it('sends paid orders out, then marks them delivered', () => {
    expect(nextSteps(order('1')).map((s) => s.to)).toEqual(['out'])
    expect(nextSteps(order('1', { delivery: 'out' })).map((s) => s.to)).toEqual(
      ['delivered', 'pending'],
    )
  })

  it('marks pickup orders collected', () => {
    const o = order('1', { deliveryPlan: plan({ method: 'pickup' }) })
    expect(nextSteps(o)).toEqual([{ to: 'collected', label: 'Mark collected' }])
  })

  it('never moves an unpaid order', () => {
    expect(nextSteps(order('1', {}, 'awaiting'))).toEqual([])
  })
})

describe('deliveryGroups', () => {
  it('groups paid orders by where they go, unarranged last', () => {
    const groups = deliveryGroups(
      [
        order('3', { deliveryPlan: plan({ area: 'Yaba' }) }),
        order('1', { deliveryPlan: plan({ area: 'Yaba' }) }),
        order('2', { deliveryPlan: plan({ method: 'pickup' }) }),
        order('4'),
        order('5', { deliveryPlan: plan({ area: 'Lekki' }) }, 'awaiting'),
        order('6', {
          deliveryPlan: plan({ area: 'Ikeja' }),
          delivery: 'delivered',
        }),
        order('7', {
          deliveryPlan: plan({
            method: 'nationwide',
            state: 'Abuja',
            park: 'Jabi',
          }),
        }),
      ],
      [],
    )
    expect(
      groups.map((g) => [g.label, g.orders.map((o) => o.order.code)]),
    ).toEqual([
      ['Yaba', ['1', '3']],
      ['Park: Jabi, Abuja', ['7']],
      ['Pickup at the shop', ['2']],
      ['Delivery not arranged yet', ['4']],
    ])
  })
})
