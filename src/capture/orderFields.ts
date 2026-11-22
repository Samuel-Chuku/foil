import type { OrderItem } from '../ledger/types'
import { parseMoney } from '../verify/money'
import { clean } from '../verify/receiptFields'

// What the model copies out of a chat: text exactly as written, never sums.
export type RawOrder = {
  items: { name: string; quantity: string; price: string }[]
  total: string
  customerName: string
  address: string
  landmark: string
  area: string
  // How the customer wants it, in their words, and where.
  deliveryChoice: string
  state: string
  park: string
  payOnDelivery: string
}

export type OrderFields = {
  items: OrderItem[]
  amountKobo: number | null
  customerName: string
  address: string
  landmark: string
  area: string
  deliveryChoice: string
  state: string
  park: string
  payOnDelivery: boolean
  pickup: boolean
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
    deliveryChoice: text(o.deliveryChoice),
    state: text(o.state),
    park: text(o.park),
    payOnDelivery: text(o.payOnDelivery),
  }
}

// "pick up", "pickup", "pick it up", "pick them up", "pick am up".
const PICKUP =
  /\bpick(ing)?[\s-]?((it|them|am|the \w+)\s)?up\b|\bcollect (it|them|am) (from|at)\b/i

// Customers write quantities as words ("two of the caps"), and the model
// copies them as written.
const WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
]

function quantity(v: string): number {
  const n = Number.parseInt(v, 10)
  if (n > 0) return n
  const t = v.trim().toLowerCase()
  if (/^(a )?dozen$/.test(t)) return 12
  return WORDS.indexOf(t) + 1 || 1
}

// Arithmetic happens here, not in the model: a stated total wins, otherwise
// the items are summed only when every one of them has a price.
export function toOrderFields(raw: RawOrder): OrderFields {
  const items = raw.items
    .filter((i) => i.name)
    .map((i) => ({
      name: i.name,
      qty: quantity(i.quantity),
      priceKobo: parseMoney(i.price),
    }))
  const summed = items.every((i) => i.priceKobo !== null)
    ? items.reduce((n, i) => n + i.qty * (i.priceKobo ?? 0), 0)
    : null
  return {
    items,
    amountKobo: parseMoney(raw.total) ?? (summed || null),
    customerName: raw.customerName,
    // Models sometimes write the pickup itself into the address field.
    address: PICKUP.test(raw.address) ? '' : raw.address,
    landmark: raw.landmark,
    area: raw.area,
    deliveryChoice: raw.deliveryChoice,
    state: raw.state,
    park: raw.park,
    payOnDelivery: /^(yes|true|y)\b/i.test(raw.payOnDelivery),
    pickup: PICKUP.test(`${raw.address} ${raw.deliveryChoice}`),
  }
}
