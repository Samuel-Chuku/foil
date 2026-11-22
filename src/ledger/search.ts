import type { Customer, Order } from './types'

// Finds orders by number, the customer's name or phone, or an item, across
// every day, newest first. Runs on this computer only.
export function findOrders(
  orders: Order[],
  customers: Customer[],
  query: string,
  limit = 20,
): Order[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const digits = q.replace(/\D/g, '')
  // A number short enough to be an order number is matched exactly; a
  // longer one is part of a phone number, written with 0 or 234.
  const asCode = /^#?\d{1,5}$/.test(q) ? q.replace('#', '') : null
  const asPhone =
    digits.length >= 4 && !asCode ? digits.replace(/^0/, '') : null
  const name = (id: string | null) =>
    customers.find((c) => c.id === id)?.name.toLowerCase() ?? ''
  return orders
    .filter(
      (o) =>
        (asCode !== null && o.code === asCode) ||
        (asPhone !== null && (o.customerId ?? '').includes(asPhone)) ||
        (!asCode && name(o.customerId).includes(q)) ||
        (!asCode && o.items.some((i) => i.name.toLowerCase().includes(q))),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}
