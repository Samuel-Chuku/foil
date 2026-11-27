import type { OrderItem } from '../ledger/types'

// A message the vendor forwarded to the desk from WhatsApp: one of theirs or
// one of the customer's, whole or the part they selected. Only this text
// travels to the panel, never the rest of the chat.
export type Forwarded = {
  text: string
  from: 'customer' | 'vendor'
  // As WhatsApp shows it, such as "10:42"; empty when unknown.
  time: string
  messageId?: string
  // The vendor selected part of the message rather than all of it.
  part?: boolean
}

// What the desk read from a forwarded message, ready to add to an order.
export type ForwardFill = {
  customerName: string
  address: string
  landmark: string
  area: string
  items: OrderItem[]
}

// The order form's fields this needs, as the panel keeps them: text, so the
// vendor can edit them before saving.
type FormShape = {
  customerName: string
  address: string
  landmark: string
  area: string
  amount: string
  addressFromLast?: boolean
  items: { name: string; qty: string; price: string; productId?: string }[]
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

const blankItem = (i: FormShape['items'][number]) =>
  !i.name.trim() && !i.productId

// Adds what a forwarded message says to the order being written. The vendor
// forwarded it on purpose, so a place in it replaces the one the form had;
// items already on the order are not added twice. `added` says what changed,
// for the vendor to check.
export function mergeForwarded<F extends FormShape>(
  form: F,
  fill: ForwardFill,
): { form: F; added: string[] } {
  const added: string[] = []
  const next: F = { ...form, items: form.items.filter((i) => !blankItem(i)) }
  for (const key of ['address', 'landmark', 'area'] as const) {
    const value = fill[key].trim()
    if (!value || same(value, form[key])) continue
    next[key] = value
    added.push(`the ${key}`)
  }
  if (added.includes('the address')) delete next.addressFromLast
  if (fill.customerName.trim() && !form.customerName.trim()) {
    next.customerName = fill.customerName.trim()
    added.push('the name')
  }
  for (const item of fill.items) {
    if (!item.name.trim() && !item.productId) continue
    const known = next.items.some((i) =>
      item.productId && i.productId
        ? i.productId === item.productId
        : same(i.name, item.name),
    )
    if (known) continue
    next.items = [
      ...next.items,
      {
        name: item.name.trim(),
        qty: String(item.qty),
        price: item.priceKobo === null ? '' : String(item.priceKobo / 100),
        ...(item.productId && { productId: item.productId }),
      },
    ]
    added.push(
      item.qty > 1 ? `${item.name.trim()} × ${item.qty}` : item.name.trim(),
    )
  }
  // New items change the total, when every line has a price to add up.
  const grew =
    next.items.length > form.items.filter((i) => !blankItem(i)).length
  if (grew) {
    const prices = next.items.map((i) => Number.parseFloat(i.price))
    if (prices.every((p) => Number.isFinite(p))) {
      const sum = next.items.reduce(
        (n, i, at) => n + (prices[at] ?? 0) * (Number.parseInt(i.qty, 10) || 1),
        0,
      )
      next.amount = String(sum)
    }
  }
  return { form: next, added }
}

// "the address, the area and Plain black cap × 2", for one line of text.
export function listSaid(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

const QUOTE_MAX = 60

// What the question box starts with when the vendor asks about a forwarded
// message; they finish the question themselves.
export function askAbout(f: Forwarded, name: string): string {
  // The question box is one line, so a long message is cut at a word.
  const flat = f.text.trim().replace(/\s+/g, ' ')
  const quoted =
    flat.length <= QUOTE_MAX
      ? flat
      : `${flat.slice(0, QUOTE_MAX).replace(/\s+\S*$/, '')}…`
  const which =
    f.from === 'customer'
      ? `this message from ${name || 'the customer'}`
      : 'my message'
  return `About ${which}: "${quoted}". `
}
