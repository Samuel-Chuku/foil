import type { Order, OrderItem, Product } from '../ledger/types'
import { formatNaira, parseNairaKobo } from '../verify/money'

// "Caps" and "cap", "Sneakers" and "sneaker" are the same word here. Both
// sides go through this, so "jeans" becoming "jean" does no harm.
function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map((w) =>
    w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w,
  )
}

const covers = (whole: string[], part: string[]) =>
  part.length > 0 && part.every((w) => whole.includes(w))

// The product an order line names. Every word of the product's name must be
// in the line ("the ankara gown in size 14" is "Ankara gown"), and the longest
// such name wins, so "green ankara gown" is "Green ankara gown". A line shorter
// than any name ("the gown") matches only if one product fits.
export function findProduct(name: string, products: Product[]): Product | null {
  const line = words(name)
  if (line.length === 0) return null
  const full = products.filter((p) => covers(line, words(p.name)))
  if (full.length > 0) {
    return full.reduce((a, b) =>
      words(b.name).length > words(a.name).length ? b : a,
    )
  }
  const partial = products.filter((p) => covers(words(p.name), line))
  return partial.length === 1 ? partial[0]! : null
}

// The product an order line is: the one it was matched to, or by name.
export function productOf(
  item: Pick<OrderItem, 'name' | 'productId'>,
  products: Product[],
): Product | null {
  if (item.productId) {
    return products.find((p) => p.id === item.productId) ?? null
  }
  return findProduct(item.name, products)
}

const paidAt = (o: Order) =>
  o.payment.state === 'matched' ? (o.payment.checkedAt ?? o.updatedAt) : null

// How many are left: the vendor's count less what paid orders since then
// took. Null for a product the shop does not count. `exceptOrderId` leaves an
// order out, so a customer's own paid order never reads as the last one gone.
export function leftOf(
  product: Product,
  orders: Order[],
  products: Product[],
  exceptOrderId?: string,
): number | null {
  if (product.qty === null) return null
  let sold = 0
  for (const o of orders) {
    const at = paidAt(o)
    if (o.id === exceptOrderId || at === null || at < product.countedAt) {
      continue
    }
    for (const i of o.items) {
      if (productOf(i, products)?.id === product.id) sold += i.qty
    }
  }
  return product.qty - sold
}

// Products the customer names in their own messages, by rules alone. A name
// inside a longer one that also matched is dropped: "green ankara gown" asks
// about one product, not two.
export function productsInChat(
  customerText: string,
  products: Product[],
): Product[] {
  const text = words(customerText)
  const found = products.filter((p) => covers(text, words(p.name)))
  return found.filter(
    (p) =>
      !found.some(
        (q) =>
          q.id !== p.id &&
          words(q.name).length > words(p.name).length &&
          covers(words(q.name), words(p.name)),
      ),
  )
}

const inStock = (left: number | null) => left === null || left > 0

// "Handbag" is like "bag".
const alike = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))

// Things the shop has that are like a sold-out one: a shared word in the name.
export function alternatives(
  product: Product,
  products: Product[],
  left: (p: Product) => number | null,
  max = 3,
): Product[] {
  const mine = words(product.name)
  return products
    .filter((p) => p.id !== product.id && p.name.trim() && inStock(left(p)))
    .filter((p) => words(p.name).some((w) => mine.some((m) => alike(m, w))))
    .slice(0, max)
}

export type Asked = { product: Product; qty: number }

// How a reply refers to a product; a photo-only piece is the one they showed.
export const called = (p: Product) =>
  p.name.trim()
    ? `the ${p.name.trim()}`
    : p.dropNo
      ? `item #${p.dropNo}`
      : 'the item in their picture'

// What a reply must say about stock, decided here and never by the model.
// Each fact opens with its item, so the model cannot pin an alternative on
// the wrong one.
export function stockFacts(
  asked: Asked[],
  products: Product[],
  left: (p: Product) => number | null,
): string[] {
  const price = (p: Product) =>
    p.priceKobo === null ? '' : ` (${formatNaira(p.priceKobo)})`
  return asked.map(({ product, qty }) => {
    const it = called(product)
    const n = left(product)
    if (n !== null && n <= 0) {
      const alt = alternatives(product, products, left)
      return alt.length > 0
        ? `About ${it}: it is sold out. Say so honestly and offer instead, for ${it} only: ${alt.map((p) => `${p.name}${price(p)}`).join(', ')}.`
        : `About ${it}: it is sold out. Say so honestly and ask whether they would like something else.`
    }
    if (n !== null && n < qty) {
      return `About ${it}: only ${n} ${n === 1 ? 'is' : 'are'} left, fewer than the ${qty} they asked for. Say so and ask whether ${n === 1 ? 'one' : n} will do.`
    }
    return `About ${it}: it is available${price(product)}.`
  })
}

// What the customer is asking about: the order's lines when there is one,
// otherwise the products their messages name.
export function askedFor(
  items: OrderItem[],
  customerText: string,
  products: Product[],
): Asked[] {
  if (items.length > 0) {
    return items.flatMap((i) => {
      const product = productOf(i, products)
      return product ? [{ product, qty: i.qty }] : []
    })
  }
  return productsInChat(customerText, products).map((product) => ({
    product,
    qty: 1,
  }))
}

// A price the chat did not give comes from the shop's list.
export function withListPrices(
  items: OrderItem[],
  products: Product[],
): OrderItem[] {
  return items.map((i) =>
    i.priceKobo !== null
      ? i
      : { ...i, priceKobo: productOf(i, products)?.priceKobo ?? null },
  )
}

export type ListedProduct = Pick<Product, 'name' | 'priceKobo' | 'qty'>

const QTY =
  /\b(\d{1,4})\s*(?:left|pcs|pieces?|units?|in stock|available|remaining)\b|\b(?:qty|stock|quantity)\s*[:=-]?\s*(\d{1,4})\b|\bx\s?(\d{1,4})\b|\((\d{1,4})\)/i
const SOLD_OUT = /\b(sold[\s-]?out|out of stock|finished)\b/i
// A price is marked as money, has thousands commas, ends in k, or has at least
// three digits; "size 14" is not one.
const PRICE =
  /(?:₦|\bngn\s?|\bn(?=\d)|#)\s?\d[\d,]*(?:\.\d{1,2})?\s?k?\b|\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\b\d+(?:\.\d+)?k\b|\b\d{3,}\b/i

// Reads a price list the vendor pastes, one product per line, such as
// "Ankara gown - ₦15,000 - 3 left" or "2. Silk scarf 5k (10)". Rules only.
export function parsePriceList(text: string): ListedProduct[] {
  const out: ListedProduct[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/^\s*(?:[-*•▪◦]|\d{1,3}[.)])\s*/, '').trim()
    if (!line) continue
    let qty: number | null = null
    if (SOLD_OUT.test(line)) {
      qty = 0
      line = line.replace(SOLD_OUT, ' ')
    }
    const q = QTY.exec(line)
    if (q) {
      qty ??= Number(q[1] ?? q[2] ?? q[3] ?? q[4])
      line = line.replace(q[0], ' ')
    }
    const p = PRICE.exec(line)
    const priceKobo = p ? parseNairaKobo(p[0]) : null
    if (p) line = line.replace(p[0], ' ')
    // Separators between the parts go; a hyphen inside a word ("T-shirt")
    // stays.
    const name = line
      .replace(/\b(each|per piece|only)\b/gi, ' ')
      .replace(/\(\s*\)/g, ' ')
      .replace(/(^|\s)[-–—:|=@/,]+(?=\s|$)/g, ' ')
      .replace(/[\s\-–—:|,=@/]+$/, '')
      .replace(/^[\s\-–—:|,=@/]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (name && /[a-z]/i.test(name)) out.push({ name, priceKobo, qty })
  }
  return out
}

const sameName = (a: string, b: string) =>
  words(a).join(' ') === words(b).join(' ')

// Adds pasted products to the list. A product already there keeps its id and
// takes the new price and count when the paste gives them; a new count is a
// fresh count from now.
export function mergeProducts(
  existing: Product[],
  listed: ListedProduct[],
  now: number,
): Product[] {
  const next = [...existing]
  for (const l of listed) {
    const at = next.findIndex((p) => sameName(p.name, l.name))
    if (at === -1) {
      next.push({
        id: crypto.randomUUID(),
        ...l,
        countedAt: now,
        updatedAt: now,
      })
      continue
    }
    const p = next[at]!
    next[at] = {
      ...p,
      priceKobo: l.priceKobo ?? p.priceKobo,
      qty: l.qty ?? p.qty,
      countedAt: l.qty !== null ? now : p.countedAt,
      updatedAt: now,
    }
  }
  return next
}
