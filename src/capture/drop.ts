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
      // In line and not yet paid.
      waiting: Claim[]
      // Others who have already paid and wait to see if the holder pays.
      paidWaiting: Claim[]
      released: Claim[]
    }
  | {
      state: 'paid' | 'sold'
      buyer: Claim
      // The buyer paid after their own hold ended, while it was still free.
      late: boolean
      others: Claim[]
    }

const paidAt = (o: Order) =>
  o.payment.state === 'matched' ? (o.payment.checkedAt ?? o.updatedAt) : null

const MIN = 60_000

// How long a claim is held for payment unless the vendor sets otherwise.
export const DEFAULT_HOLD_MIN = 10

// The claims on one item, in the order customers asked.
export function claimsOn(product: Product, orders: Order[]): Claim[] {
  return orders
    .filter((o) => o.items.some((i) => i.productId === product.id))
    .map((order) => ({ order, claimedAt: order.claimedAt ?? order.createdAt }))
    .sort((a, b) => a.claimedAt - b.claimedAt)
}

const byPayment = (a: Claim, b: Claim) => paidAt(a.order)! - paidAt(b.order)!

// Each claim holds in turn for the hold time, from when the vendor took it
// down or when the turn before it ended, whichever is later; the vendor can
// end a hold early. A payment wins during its payer's own turn. A payment
// made out of turn waits: if the holder's time runs out unpaid, the earliest
// such payment takes the item; if the holder pays, it is refunded.
export function itemState(
  product: Product,
  orders: Order[],
  holdMin: number,
  now: number,
): ItemState {
  const claims = claimsOn(product, orders)
  const won = (buyer: Claim, late: boolean): ItemState => ({
    state: buyer.order.delivery === 'pending' ? 'paid' : 'sold',
    buyer,
    late,
    others: claims.filter((c) => c !== buyer),
  })
  const released: Claim[] = []
  let free = 0
  for (const [n, c] of claims.entries()) {
    const start = Math.max(c.order.createdAt, free)
    const end = Math.min(start + holdMin * MIN, c.order.releasedAt ?? Infinity)
    const paid = paidAt(c.order)
    if (paid !== null && paid < end) return won(c, false)
    if (now < end) {
      return {
        state: 'held',
        holder: c,
        until: end,
        waiting: claims.slice(n + 1).filter((x) => paidAt(x.order) === null),
        paidWaiting: claims.filter((x) => x !== c && paidAt(x.order) !== null),
        released,
      }
    }
    released.push(c)
    // Someone whose turn had passed paid while this one held it.
    const waited = released
      .filter((x) => {
        const p = paidAt(x.order)
        return p !== null && p < end
      })
      .sort(byPayment)[0]
    if (waited) return won(waited, true)
    free = end
  }
  // Every turn has passed; the first to pay since takes it.
  const after = claims
    .filter((c) => paidAt(c.order) !== null)
    .sort(byPayment)[0]
  return after ? won(after, true) : { state: 'available', released }
}

// Where one customer's order stands on a drop item, for the reply to them.
export type ClaimRole =
  | { role: 'holder'; until: number; afterRelease: boolean }
  | { role: 'waiting'; place: number }
  | { role: 'paidWaiting'; until: number }
  | { role: 'released' }
  | { role: 'bought'; late: boolean }
  | { role: 'lost' }
  | { role: 'refund' }

export function roleOf(state: ItemState, orderId: string): ClaimRole | null {
  const is = (c: Claim) => c.order.id === orderId
  switch (state.state) {
    case 'held': {
      if (is(state.holder)) {
        return {
          role: 'holder',
          until: state.until,
          afterRelease: state.released.length > 0,
        }
      }
      if (state.paidWaiting.some(is)) {
        return { role: 'paidWaiting', until: state.until }
      }
      if (state.released.some(is)) return { role: 'released' }
      const place = state.waiting.findIndex(is)
      return place === -1 ? null : { role: 'waiting', place: place + 1 }
    }
    case 'available':
      return state.released.some(is) ? { role: 'released' } : null
    case 'paid':
    case 'sold': {
      if (is(state.buyer)) return { role: 'bought', late: state.late }
      const other = state.others.find(is)
      if (!other) return null
      return paidAt(other.order) !== null
        ? { role: 'refund' }
        : { role: 'lost' }
    }
  }
}

// What a reply must say about the customer's place for a drop item. Other
// customers are never named, and no clock time is given: a hold is spoken of
// in minutes left, and only payment secures an item. `others` are pieces
// from the same drop still free, offered when this one is not theirs.
export function dropFacts(
  item: string,
  role: ClaimRole,
  price: string | null,
  now: number,
  others: string[] = [],
): string {
  const pay = price ? ` of ${price}` : ''
  const offer = others.length
    ? ` Offer these pieces from the same drop that are still free: ${others.join(', ')}.`
    : ''
  const left = (until: number) => Math.max(1, Math.ceil((until - now) / MIN))
  switch (role.role) {
    case 'holder':
      return role.afterRelease
        ? `${item} is free again and they are next. If they still want it, it is theirs once they pay${pay} within the next ${left(role.until)} minutes; only payment secures it, and after that it passes on. Do not give a clock time.`
        : `${item} is theirs if they pay${pay} within the next ${left(role.until)} minutes; only payment secures it, and after that it passes to the next person waiting. Do not give a clock time.`
    case 'waiting':
      return `${item} is on hold for another customer. They are number ${role.place} in line; only payment secures it, and the shop will message them if it becomes free.${offer}`
    case 'paidWaiting':
      return `Their payment has arrived, but ${item} is held for another customer for up to ${left(role.until)} more minutes. Say that if it is not paid for by then it is theirs, and if it is, the shop will send their money back.`
    case 'released':
      return `Their hold on ${item} ended without payment, so it went to the next person in line. Apologise warmly and say the shop will tell them if it comes back.${offer}`
    case 'bought':
      return role.late
        ? `Their payment arrived after their hold ended, but ${item} was still free, so it is theirs. Thank them warmly.`
        : `${item} is paid for and theirs.`
    case 'lost':
      return `${item} has been sold to another customer. Apologise warmly and thank them for their interest.${offer}`
    case 'refund':
      return `${item} was sold to a customer who paid first, so their payment will be sent back in full. Apologise warmly and ask for the account number, bank and account name to refund to, unless the chat already gives them.${offer}`
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
  others: string[] = [],
): string {
  const offer = others.length
    ? ` Offer these pieces from the same drop that are still free: ${others.join(', ')}.`
    : ''
  switch (state.state) {
    case 'available':
      return `${item} is available${price ? ` at ${price}` : ''}. Say so plainly and ask them to confirm they want it; once they confirm it is held for them for ${holdMin} minutes, and only payment secures it.`
    case 'held':
      return `${item} is on hold for another customer. Offer to put them in line; only payment secures it, and the shop will message them if it becomes free.${offer}`
    case 'paid':
    case 'sold':
      return `${item} has been sold. Apologise warmly and thank them for asking.${offer}`
  }
}
