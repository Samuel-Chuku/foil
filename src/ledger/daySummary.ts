import type { DayBooks } from './dayBooks'

// The end of the day in a few lines, built by rules from the books on this
// computer: one for the vendor or a partner, with the money, and one for a
// WhatsApp status, with no figures or names, saying what is still in stock.

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

function listed(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

export function ownerSummary(
  b: DayBooks,
  o: { shop: string; dayTitle: string; money: (kobo: number) => string },
): string {
  const { money } = o
  const lines = [`${o.shop || 'My shop'} · ${o.dayTitle}`]
  if (b.orders === 0 && b.moneyInKobo === 0) {
    lines.push('No orders or bank money yet today.')
    return lines.join('\n')
  }
  lines.push(
    b.orders === 0
      ? 'No new orders.'
      : `${plural(b.orders, 'order')}, worth ${money(b.orderedKobo)}${b.unpriced ? ` (${b.unpriced} without a price yet)` : ''}.`,
  )
  if (b.paid.count) {
    lines.push(
      `Money landed: ${money(b.paid.kobo)} for ${plural(b.paid.count, 'paid order')}.`,
    )
  }
  if (b.short.count) {
    lines.push(
      `Paid in part: ${b.short.count}, with ${money(b.short.kobo)} still owed.`,
    )
  }
  if (b.waiting.count) {
    lines.push(
      `Waiting for payment: ${b.waiting.count} (${money(b.waiting.kobo)}).`,
    )
  }
  if (b.toCheck.count) lines.push(`Receipts to check: ${b.toCheck.count}.`)
  if (b.notTied.count) {
    lines.push(
      `Money that pays no order yet: ${money(b.notTied.kobo)} (${b.notTied.count}).`,
    )
  }
  if (b.refundsOwed.count) {
    lines.push(`Refunds still owed: ${money(b.refundsOwed.kobo)}.`)
  }
  const d = b.delivery
  if (d.toSend + d.out + d.done > 0) {
    lines.push(`Deliveries: ${d.toSend} to send, ${d.out} out, ${d.done} done.`)
  }
  const top = b.items[0]
  if (top) lines.push(`Best seller: ${top.qty} × ${top.name}.`)
  return lines.join('\n')
}

export function statusUpdate(o: {
  shop: string
  // Orders today, to thank customers only when there were some.
  orders: number
  available: string[]
  soldOut: string[]
}): string {
  const lines: string[] = []
  lines.push(
    o.orders > 0
      ? `Thank you to everyone who ordered from ${o.shop || 'us'} today!`
      : `${o.shop || 'We'} ${o.shop ? 'is' : 'are'} open for orders.`,
  )
  const available = o.available.slice(0, 6)
  if (available.length) {
    lines.push(
      `Still available: ${o.available.length > 6 ? `${available.join(', ')} and more` : listed(available)}.`,
    )
  }
  if (o.soldOut.length) {
    lines.push(`Sold out today: ${listed(o.soldOut.slice(0, 4))}.`)
  }
  lines.push('Send us a message to order.')
  return lines.join('\n')
}
