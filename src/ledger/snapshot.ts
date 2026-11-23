import { shopWords } from '../config/marketWords'
import { itemState } from '../capture/drop'
import { deliveryOptions, type ShopRules } from '../capture/shopRules'
import { leftOf } from '../capture/stock'
import { formatMoney } from '../verify/money'
import type { Credit } from '../verify/types'
import { balanceKobo, dueKobo } from './ledger'
import type { ChatNote, Drop, Order, Product, Settlement } from './types'

// What the "Ask the desk" chat knows about the business, as plain lines the
// vendor approves before anything is sent. It holds the shop's own facts:
// orders by number, items, stock, money and rules. It never holds a
// customer's name, phone number, address or chat text.

export const PAYMENT: Record<Order['payment']['state'], string> = {
  awaiting: 'waiting for payment',
  matched: 'paid',
  'not yet credited': 'not yet credited',
  mismatch: 'receipt does not match',
  check: 'receipt to check',
}

export const DELIVERY: Record<Order['delivery'], string> = {
  pending: 'not sent yet',
  out: 'out for delivery',
  delivered: 'delivered',
  collected: 'collected',
}

export function where(o: Order): string {
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
    .map((o) => orderLine(o, credits))
}

// One order as the desk describes it: number, items, money, payment,
// delivery. No name, phone or address.
export function orderLine(o: Order, credits: Credit[]): string {
  const due = dueKobo(o)
  const owed = balanceKobo(o, credits) ?? 0
  const items = o.items.map((i) => `${i.qty} x ${i.name}`).join(', ')
  return [
    `Order ${o.code}`,
    items || 'items not captured',
    due === null ? 'no price yet' : formatMoney(due),
    owed > 0
      ? `paid in part, ${formatMoney(owed)} still owed`
      : PAYMENT[o.payment.state],
    where(o),
    DELIVERY[o.delivery],
  ].join('; ')
}

export function stockLines(products: Product[], orders: Order[]): string[] {
  return products
    .filter((p) => !p.dropId && p.name.trim())
    .map((p) => {
      const left = leftOf(p, orders, products)
      return `${p.name.trim()}: ${p.priceKobo === null ? 'no price' : formatMoney(p.priceKobo)}, ${left === null ? 'not counted' : left <= 0 ? 'sold out' : `${left} left`}`
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
      return `#${p.dropNo ?? '?'} ${p.priceKobo === null ? '' : formatMoney(p.priceKobo)} ${s.state}`
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
  return `Refunds owed ${formatMoney(sum('refund owed'))}, refunds sent ${formatMoney(sum('refunded'))}, extra money kept ${formatMoney(sum('kept'))}.`
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

// Still owed money and not yet finished.
export function isUnpaid(o: Order, credits: Credit[]): boolean {
  return (
    (o.payment.state !== 'matched' || (balanceKobo(o, credits) ?? 0) > 0) &&
    (o.delivery === 'pending' || o.delivery === 'out')
  )
}

// Fully paid and waiting to go out; pickups wait for the customer instead.
export function isToSend(o: Order, credits: Credit[]): boolean {
  return (
    o.payment.state === 'matched' &&
    (balanceKobo(o, credits) ?? 0) <= 0 &&
    o.delivery === 'pending' &&
    o.deliveryPlan?.method !== 'pickup'
  )
}

// The answers to the common questions, worked out here so the model only has
// to read them: small on-device models garble long lists they must filter.
export function answerLines(
  orders: Order[],
  credits: Credit[],
  products: Product[],
): string[] {
  const byCode = (a: Order, b: Order) => Number(a.code) - Number(b.code)
  // "#73, #76": each number stands apart, which small models copy better
  // than bare runs of numbers they tend to merge.
  const list = (os: Order[]) =>
    os.length
      ? os
          .sort(byCode)
          .map((o) => `#${o.code}`)
          .join(', ')
      : 'none'
  const unpaid = orders.filter((o) => isUnpaid(o, credits))
  const toSend = orders.filter((o) => isToSend(o, credits))
  const counted = products
    .filter((p) => !p.dropId && p.name.trim())
    .map((p) => ({ p, left: leftOf(p, orders, products) }))
    .filter((x) => x.left !== null)
  const soldOut = counted
    .filter((x) => x.left! <= 0)
    .map((x) => x.p.name.trim())
  const low = counted
    .filter((x) => x.left! > 0 && x.left! <= 2)
    .map((x) => `${x.p.name.trim()} (${x.left} left)`)
  return [
    `Unpaid or part-paid orders still open, by number: ${list(unpaid)}.`,
    `Paid orders still to send out: ${list(toSend)}.`,
    `Sold out: ${soldOut.join(', ') || 'nothing'}. Running low: ${low.join(', ') || 'nothing'}.`,
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
    'Quick answers:',
    ...answerLines(parts.orders, parts.credits, parts.products),
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

export function deskInstructions(): string {
  const w = shopWords()
  return `You are the assistant for ${w.shop}. Answer the owner's questions about their business from the facts below only: today's books, this week's trends against last week, open orders by number with their items, payment and delivery, stock, any running drop, customers waiting by type, money owed back, and the shop's own rules. Write short, plain, practical ${w.language}, with ${w.money}, and refer to orders by number, copying each order number exactly as listed. Start from the Quick answers: they are worked out from the records and are correct, so never contradict them. An order is ready to send only once it is paid; an unpaid order is waiting for payment, not for sending. If one of the shop's charts would help the answer, name it in "chart", otherwise "none". You do not know customers' names, phone numbers or addresses; if a question needs them, say those details stay on the shop's computer and the panel shows them. Never call a payment or a customer fake or a fraud. Do not give financial, tax, loan or investment advice.`
}

export type Exchange = { question: string; answer: string }

// The on-device model takes one request at a time and holds no chat, so each
// question carries the shop's facts and the last few exchanges with it.
// About 4 characters make a token; the device's limit is 9,216 tokens, so
// the request is kept well under it.
export const DEVICE_ASK_MAX_CHARS = 24_000

export function deviceAskPrompt(
  instructions: string,
  charts: string,
  facts: string,
  history: Exchange[],
  question: string,
): string | null {
  const recent = history
    .slice(-3)
    .map((e) => `Owner asked: ${e.question}\nYou answered: ${e.answer}`)
    .join('\n')
  const prompt = [
    instructions,
    charts,
    facts,
    ...(recent ? [`Earlier in this conversation:\n${recent}`] : []),
    `Question: ${question}`,
  ].join('\n\n')
  // Too long for the device: the caller asks the cloud instead.
  return prompt.length > DEVICE_ASK_MAX_CHARS ? null : prompt
}

// Small on-device models sometimes merge neighbouring numbers when copying a
// list ("#78, #80" becomes "#780", sharing the 8). A number in an answer that
// is not one of the shop's orders, but reads as two that are, either side by
// side or overlapping by a digit, is put back as both.
export function repairOrderNumbers(answer: string, codes: string[]): string {
  const known = new Set(codes)
  return answer.replace(/#(\d{2,})\b/g, (whole, digits: string) => {
    if (known.has(digits)) return whole
    for (let i = 1; i < digits.length; i++) {
      const pairs = [
        [digits.slice(0, i), digits.slice(i)],
        [digits.slice(0, i + 1), digits.slice(i)],
      ]
      for (const [a, b] of pairs) {
        if (a && b && a !== b && known.has(a) && known.has(b)) {
          return `#${a}, #${b}`
        }
      }
    }
    return whole
  })
}
