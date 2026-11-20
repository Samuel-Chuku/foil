import type { OrderItem } from '../ledger/types'
import { parseNairaKobo } from '../verify/money'
import { clean } from '../verify/receiptFields'

// What the model copies out of a chat: text exactly as written, never sums.
export type RawOrder = {
  items: { name: string; quantity: string; price: string }[]
  total: string
  customerName: string
  address: string
  landmark: string
  area: string
}

export type OrderFields = {
  items: OrderItem[]
  amountKobo: number | null
  customerName: string
  address: string
  landmark: string
  area: string
}

const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? clean(String(v)) : ''

// The model's JSON is untrusted input: keep only the expected shape, as text.
export function pickOrder(json: unknown): RawOrder {
  const o = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  const items = Array.isArray(o.items) ? (o.items as unknown[]) : []
  return {
    items: items.map((i) => {
      const r = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>
      return {
        name: text(r.name),
        quantity: text(r.quantity),
        price: text(r.price),
      }
    }),
    total: text(o.total),
    customerName: text(o.customerName),
    address: text(o.address),
    landmark: text(o.landmark),
    area: text(o.area),
  }
}

// Arithmetic happens here, not in the model: a stated total wins, otherwise
// the items are summed only when every one of them has a price.
export function toOrderFields(raw: RawOrder): OrderFields {
  const items = raw.items
    .filter((i) => i.name)
    .map((i) => ({
      name: i.name,
      qty: Math.max(1, Number.parseInt(i.quantity, 10) || 1),
      priceKobo: parseNairaKobo(i.price),
    }))
  const summed = items.every((i) => i.priceKobo !== null)
    ? items.reduce((n, i) => n + i.qty * (i.priceKobo ?? 0), 0)
    : null
  return {
    items,
    amountKobo: parseNairaKobo(raw.total) ?? (summed || null),
    customerName: raw.customerName,
    address: raw.address,
    landmark: raw.landmark,
    area: raw.area,
  }
}
