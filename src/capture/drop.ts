import type { Order, Product } from '../ledger/types'

// Drop mode: one-of-a-kind items posted on status, first to pay wins. Who
// holds an item, who waits and who lost it are worked out from the orders and
// the clock each time, so nothing can go stale or disagree with the books.

export type Claim = {
  order: Order
  // When the customer asked, from their message: the queue order.
  claimedAt: number
}

export type ItemState =
  | { state: 'available'; released: Claim[] }
  | {
      state: 'held'
      holder: Claim
      until: number
      waiting: Claim[]
      released: Claim[]
    }
  | { state: 'paid' | 'sold'; buyer: Claim; others: Claim[] }

const paidAt = (o: Order) =>
  o.payment.state === 'matched' ? (o.payment.checkedAt ?? o.updatedAt) : null

const MIN = 60_000

// The claims on one item, in the order customers asked.
export function claimsOn(product: Product, orders: Order[]): Claim[] {
  return orders
    .filter((o) => o.items.some((i) => i.productId === product.id))
    .map((order) => ({ order, claimedAt: order.claimedAt ?? order.createdAt }))
    .sort((a, b) => a.claimedAt - b.claimedAt)
}

export function itemState(
  product: Product,
  orders: Order[],
  holdMin: number,
  now: number,
): ItemState {
  const claims = claimsOn(product, orders)
  // Money decides: the first claim that paid has the item, even if it paid
  // after its hold ran out; the vendor sees that and can settle it.
  const paid = claims
    .filter((c) => paidAt(c.order) !== null)
    .sort((a, b) => paidAt(a.order)! - paidAt(b.order)!)[0]
  if (paid) {
    return {
      state: paid.order.delivery === 'pending' ? 'paid' : 'sold',
      buyer: paid,
      others: claims.filter((c) => c !== paid),
    }
  }
  // Otherwise each claim holds in turn for the hold time, starting when the
  // vendor took it down or when the claim before it ran out, whichever is
  // later. The vendor can end a hold early.
  const released: Claim[] = []
  let free = 0
  for (const [n, c] of claims.entries()) {
    const start = Math.max(c.order.createdAt, free)
    const end = Math.min(start + holdMin * MIN, c.order.releasedAt ?? Infinity)
    if (now < end) {
      return {
        state: 'held',
        holder: c,
        until: end,
        waiting: claims.slice(n + 1),
        released,
      }
    }
    released.push(c)
    free = end
  }
  return { state: 'available', released }
}

// Where one customer's order stands on a drop item, for the reply to them.
export type ClaimRole =
  | { role: 'holder'; until: number; afterRelease: boolean }
  | { role: 'waiting'; place: number }
  | { role: 'released' }
  | { role: 'bought' }
  | { role: 'lost' }

export function roleOf(state: ItemState, orderId: string): ClaimRole | null {
  switch (state.state) {
    case 'held':
      if (state.holder.order.id === orderId) {
        return {
          role: 'holder',
          until: state.until,
          afterRelease: state.released.length > 0,
        }
      }
      if (state.released.some((c) => c.order.id === orderId)) {
        return { role: 'released' }
      }
      {
        const place = state.waiting.findIndex((c) => c.order.id === orderId)
        return place === -1 ? null : { role: 'waiting', place: place + 1 }
      }
    case 'available':
      return state.released.some((c) => c.order.id === orderId)
        ? { role: 'released' }
        : null
    case 'paid':
    case 'sold':
      if (state.buyer.order.id === orderId) return { role: 'bought' }
      return state.others.some((c) => c.order.id === orderId)
        ? { role: 'lost' }
        : null
  }
}

// What a reply must say about the customer's place for a drop item. Other
// customers are never named.
export function dropFacts(
  item: string,
  role: ClaimRole,
  price: string | null,
  clock: (ms: number) => string,
): string {
  const pay = price ? ` of ${price}` : ''
  switch (role.role) {
    case 'holder':
      return role.afterRelease
        ? `${item} is free again and is now held for them until ${clock(role.until)}. Ask whether they still want it, and to send the payment${pay} before then to keep it.`
        : `${item} is theirs, held until ${clock(role.until)}. Ask them to send the payment${pay} before then to keep it.`
    case 'waiting':
      return `${item} is on hold for another customer. They are number ${role.place} in line; say the shop will message them if it becomes free.`
    case 'released':
      return `Their hold on ${item} ended without payment, so it has gone to the next person in line. Apologise kindly; if it becomes free again the shop will tell them.`
    case 'bought':
      return `${item} is paid for and theirs.`
    case 'lost':
      return `${item} has been sold to another customer. Apologise kindly and say it is no longer available.`
  }
}

// A message's "15:27" on the day of `lagosNow`, as Lagos wall-clock ms.
export function messageTime(hhmm: string, lagosNow: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const day = new Date(lagosNow)
  return Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    Number(m[1]),
    Number(m[2]),
  )
}

// What to say about a drop item to someone who has not claimed it yet.
export function unclaimedFacts(
  item: string,
  state: ItemState,
  price: string | null,
  holdMin: number,
): string {
  switch (state.state) {
    case 'available':
      return `${item} is available${price ? ` at ${price}` : ''}. Ask them to confirm they want it; once confirmed it is held for them for ${holdMin} minutes while they pay.`
    case 'held':
      return `${item} is on hold for another customer. Offer to put them in line; the shop will message them if it becomes free.`
    case 'paid':
    case 'sold':
      return `${item} has been sold. Apologise kindly and say it is no longer available.`
  }
}
