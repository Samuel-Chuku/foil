import { itemState } from '../capture/drop'
import { deliveryOptions, type ShopRules } from '../capture/shopRules'
import { leftOf } from '../capture/stock'
import { formatNaira } from '../verify/money'
import type { Credit } from '../verify/types'
import { balanceKobo, dueKobo } from './ledger'
import type { ChatNote, Drop, Order, Product, Settlement } from './types'

// What the "Ask the desk" chat knows about the business, as plain lines the
// vendor approves before anything is sent. It holds the shop's own facts:
// orders by number, items, stock, money and rules. It never holds a
// customer's name, phone number, address or chat text.

const PAYMENT: Record<Order['payment']['state'], string> = {
  awaiting: 'waiting for payment',
  matched: 'paid',
  'not yet credited': 'not yet credited',
  mismatch: 'receipt does not match',
  check: 'receipt to check',
}

const DELIVERY: Record<Order['delivery'], string> = {
  pending: 'not sent yet',
  out: 'out for delivery',
  delivered: 'delivered',
  collected: 'collected',
}

function where(o: Order): string {
  const p = o.deliveryPlan
  if (!p?.method) return 'delivery not discussed'
  if (p.method === 'pickup') return 'pickup'
  if (p.method === 'nationwide') return `park in ${p.state || 'another state'}`
  return p.area ? `delivery to ${p.area}` : 'delivery'
}

// Orders still needing something, newest numbers last.
export function openOrderLines(orders: Order[], credits: Credit[]): string[] {
  return orders
    .filter(
      (o) =>
        o.payment.state !== 'matched' ||
        (balanceKobo(o, credits) ?? 0) > 0 ||
        o.delivery === 'pending' ||
        o.delivery === 'out',
    )
    .sort((a, b) => Number(a.code) - Number(b.code))
    .map((o) => {
      const due = dueKobo(o)
      const owed = balanceKobo(o, credits) ?? 0
      const items = o.items.map((i) => `${i.qty} x ${i.name}`).join(', ')
      return [
        `Order ${o.code}`,
        items || 'items not captured',
        due === null ? 'no price yet' : formatNaira(due),
        owed > 0
          ? `paid in part, ${formatNaira(owed)} still owed`
          : PAYMENT[o.payment.state],
        where(o),
        DELIVERY[o.delivery],
      ].join('; ')
    })
}

export function stockLines(products: Product[], orders: Order[]): string[] {
  return products
    .filter((p) => !p.dropId && p.name.trim())
    .map((p) => {
      const left = leftOf(p, orders, products)
      return `${p.name.trim()}: ${p.priceKobo === null ? 'no price' : formatNaira(p.priceKobo)}, ${left === null ? 'not counted' : left <= 0 ? 'sold out' : `${left} left`}`
    })
}

export function dropLines(
  drops: Drop[],
  products: Product[],
  orders: Order[],
  now: number,
): string[] {
  const live = drops.find((d) => d.endedAt === null)
  if (!live) return []
  const items = products
    .filter((p) => p.dropId === live.id)
    .sort((a, b) => (a.dropNo ?? 0) - (b.dropNo ?? 0))
    .map((p) => {
      const s = itemState(p, orders, live.holdMin, now)
      return `#${p.dropNo ?? '?'} ${p.priceKobo === null ? '' : formatNaira(p.priceKobo)} ${s.state}`
    })
  return [
    `Running drop "${live.name}" (holds last ${live.holdMin} min): ${items.join('; ')}.`,
  ]
}

export function waitingLine(chats: ChatNote[]): string {
  const waiting = chats.filter((c) => c.lastFrom === 'customer')
  if (waiting.length === 0) return 'No customer is waiting for a reply.'
  const by = new Map<string, number>()
  for (const c of waiting) {
    const k = c.label ?? 'not sorted yet'
    by.set(k, (by.get(k) ?? 0) + 1)
  }
  return `${waiting.length} customers are waiting for a reply: ${[...by]
    .map(([k, n]) => `${n} ${k}`)
    .join(', ')}.`
}

export function moneyLine(settlements: Settlement[]): string {
  const sum = (state: Settlement['state']) =>
    settlements
      .filter((s) => s.state === state)
      .reduce((t, s) => t + s.amountKobo, 0)
  return `Refunds owed ${formatNaira(sum('refund owed'))}, refunds sent ${formatNaira(sum('refunded'))}, extra money kept ${formatNaira(sum('kept'))}.`
}

export function rulesLines(rules: ShopRules): string[] {
  return [
    ...deliveryOptions(rules),
    ...(rules.pickupHours ? [`Pickup hours: ${rules.pickupHours}.`] : []),
    ...(rules.refundTerms
      ? [`Refunds and exchanges: ${rules.refundTerms}`]
      : []),
    ...(rules.policies
      ? [`Other policies: ${rules.policies.replace(/\s+/g, ' ').slice(0, 800)}`]
      : []),
  ]
}

export function businessText(parts: {
  books: string
  trends: string
  orders: Order[]
  credits: Credit[]
  products: Product[]
  drops: Drop[]
  settlements: Settlement[]
  chats: ChatNote[]
  rules: ShopRules
  now: number
}): string {
  const open = openOrderLines(parts.orders, parts.credits)
  const stock = stockLines(parts.products, parts.orders)
  const drop = dropLines(parts.drops, parts.products, parts.orders, parts.now)
  const rules = rulesLines(parts.rules)
  return [
    parts.books,
    parts.trends,
    `Open orders, by number (${open.length}):`,
    ...(open.length ? open : ['None.']),
    `Stock (${stock.length} products):`,
    ...(stock.length ? stock : ['No stock list yet.']),
    ...drop,
    waitingLine(parts.chats),
    moneyLine(parts.settlements),
    ...(rules.length ? ['Shop rules:', ...rules] : []),
  ].join('\n')
}

export const DESK_INSTRUCTIONS = `You are the assistant for a small Lagos shop that sells on WhatsApp and is paid by bank transfer. Answer the owner's questions about their business from the facts below only: today's books, this week's trends against last week, open orders by number with their items, payment and delivery, stock, any running drop, customers waiting by type, money owed back, and the shop's own rules. Write short, plain, practical English, with amounts in naira written like ₦18,500, and refer to orders by number. If one of the shop's charts would help the answer, name it in "chart", otherwise "none". You do not know customers' names, phone numbers or addresses; if a question needs them, say those details stay on the shop's computer and the panel shows them. Never call a payment or a customer fake or a fraud. Do not give financial, tax, loan or investment advice.`
