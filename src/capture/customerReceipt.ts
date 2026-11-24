import { dueKobo, paidKobo } from '../ledger/ledger'
import type { Order } from '../ledger/types'
import { formatMoney } from '../verify/money'
import type { Credit } from '../verify/types'

// A receipt the vendor sends the customer once their money has landed. Built
// on this computer from the order and the bank credits, by rules alone; it
// goes only to that customer, and only when the vendor sends it.

export type CustomerReceipt = {
  shop: string
  // Empty when the shop keeps order numbers off its receipts.
  orderCode: string
  customer: string | null
  // When the last of the money landed, shop wall-clock; null if the bank
  // gave no time.
  paidAt: number | null
  lines: { label: string; kobo: number | null }[]
  totalKobo: number
  paidKobo: number
  // More than zero for a part payment.
  owedKobo: number
  // Said once, below the total, when the rider collects the delivery fee.
  riderNote: string | null
  // The last digits of the transfer's session ID or reference.
  refEnding: string | null
}

function deliveryLabel(order: Order): string {
  const p = order.deliveryPlan
  if (!p) return 'Delivery'
  if (p.method === 'nationwide') {
    return `Delivery to ${[p.park, p.state].filter(Boolean).join(', ') || 'park'}`
  }
  return p.area ? `Delivery to ${p.area}` : 'Delivery'
}

// Null until the order is paid, at least in part, by credits the rules or the
// vendor accepted.
export function receiptFor(
  order: Order,
  credits: Credit[],
  shop: string,
  customer: string | null,
): CustomerReceipt | null {
  const total = dueKobo(order)
  if (order.payment.state !== 'matched' || total === null) return null
  const paid = paidKobo(order, credits)
  if (paid <= 0) return null
  const used = [order.payment.creditId, ...order.payment.topUpIds].flatMap(
    (id) => credits.find((c) => c.id === id) ?? [],
  )
  const last = used.reduce<number | null>(
    (t, c) => (c.at && (t === null || c.at.ms > t) ? c.at.ms : t),
    null,
  )
  const ref =
    order.payment.sessionId ??
    used.find((c) => c.sessionId)?.sessionId ??
    used.find((c) => c.reference)?.reference ??
    null
  const plan = order.deliveryPlan
  const fee = plan?.feeKobo ?? null
  const lines =
    order.items.length > 0
      ? order.items.map((i) => ({
          label: `${i.qty} x ${i.name}`,
          kobo: i.priceKobo === null ? null : i.priceKobo * i.qty,
        }))
      : [{ label: 'Your order', kobo: order.amountKobo }]
  if (plan?.paidTo === 'shop' && fee !== null && fee > 0) {
    lines.push({ label: deliveryLabel(order), kobo: fee })
  }
  return {
    shop: shop.trim(),
    orderCode: order.code,
    customer: customer?.trim() || null,
    paidAt: last,
    lines,
    totalKobo: total,
    paidKobo: Math.min(paid, total),
    owedKobo: Math.max(0, total - paid),
    riderNote:
      plan?.paidTo === 'rider' && fee !== null && fee > 0
        ? `Delivery fee of ${formatMoney(fee)} is paid to the rider.`
        : null,
    refEnding: ref ? ref.replace(/\D/g, '').slice(-6) || null : null,
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// "Sat 21 Nov, 3:42 PM", from shop wall-clock milliseconds. Built by hand
// so it reads the same in every browser locale.
export function receiptTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getUTCHours()
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
}

export const receiptTitle = (r: CustomerReceipt) =>
  r.owedKobo > 0 ? 'Part payment received' : 'Payment received'

// For the chat's message box, in WhatsApp's own formatting (*bold*).
export function receiptText(r: CustomerReceipt): string {
  return [
    `*${receiptTitle(r)}* ✅`,
    [r.shop, r.orderCode && `Order ${r.orderCode}`].filter(Boolean).join(' · '),
    ...(r.paidAt !== null ? [receiptTime(r.paidAt)] : []),
    '',
    ...r.lines.map(
      (l) => `${l.label}${l.kobo === null ? '' : `: ${formatMoney(l.kobo)}`}`,
    ),
    `*Total: ${formatMoney(r.totalKobo)}*`,
    r.owedKobo > 0
      ? `Paid: ${formatMoney(r.paidKobo)} · *Still to pay: ${formatMoney(r.owedKobo)}*`
      : `*Paid: ${formatMoney(r.paidKobo)}*`,
    ...(r.riderNote ? [r.riderNote] : []),
    ...(r.refEnding ? [`Transfer ref ending ${r.refEnding}`] : []),
    '',
    r.shop
      ? `Thank you for shopping with ${r.shop}!`
      : 'Thank you for your order!',
  ].join('\n')
}
