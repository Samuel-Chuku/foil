import { balanceKobo } from '../ledger/ledger'
import type { Order } from '../ledger/types'
import type { Credit } from '../verify/types'

// Where paid orders go and what the vendor can mark next. Pure, so the
// steps and the grouping are tested.

export type Step = { to: Order['delivery']; label: string; undo?: boolean }

// Pickup orders are collected; everything else goes out, then arrives. Only
// paid orders move, so a delivery is never marked before the money landed.
export function nextSteps(order: Order): Step[] {
  if (order.payment.state !== 'matched') return []
  const pickup = order.deliveryPlan?.method === 'pickup'
  if (order.delivery === 'pending') {
    return pickup
      ? [{ to: 'collected', label: 'Mark collected' }]
      : [{ to: 'out', label: 'Mark out for delivery' }]
  }
  if (order.delivery === 'out') {
    return [
      { to: 'delivered', label: 'Mark delivered' },
      { to: 'pending', label: 'Not sent yet', undo: true },
    ]
  }
  return [{ to: 'pending', label: 'Undo', undo: true }]
}

export function groupLabel(order: Order): string {
  const p = order.deliveryPlan
  if (!p?.method) return 'Delivery not arranged yet'
  if (p.method === 'pickup') return 'Pickup at the shop'
  if (p.method === 'nationwide') {
    return `Park: ${[p.park, p.state].filter(Boolean).join(', ') || 'another state'}`
  }
  return p.area.trim() || 'Area not given'
}

export type DeliveryGroup = {
  label: string
  orders: { order: Order; owedKobo: number }[]
}

// Paid orders not yet delivered or collected, by area, biggest group first;
// "not arranged" comes last so it is never mistaken for a rider's run.
export function deliveryGroups(
  orders: Order[],
  credits: Credit[],
): DeliveryGroup[] {
  const groups = new Map<string, DeliveryGroup>()
  for (const o of orders) {
    if (o.payment.state !== 'matched') continue
    if (o.delivery !== 'pending' && o.delivery !== 'out') continue
    const label = groupLabel(o)
    const g = groups.get(label) ?? { label, orders: [] }
    g.orders.push({
      order: o,
      owedKobo: Math.max(0, balanceKobo(o, credits) ?? 0),
    })
    groups.set(label, g)
  }
  const last = (g: DeliveryGroup) => g.label === 'Delivery not arranged yet'
  return [...groups.values()]
    .map((g) => ({
      ...g,
      orders: g.orders.sort(
        (a, b) => Number(a.order.code) - Number(b.order.code),
      ),
    }))
    .sort(
      (a, b) =>
        Number(last(a)) - Number(last(b)) ||
        b.orders.length - a.orders.length ||
        a.label.localeCompare(b.label),
    )
}
