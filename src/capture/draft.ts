import type { OrderItem, PaymentState, Settlement } from '../ledger/types'
import { formatNaira } from '../verify/money'

export type DraftFacts = {
  payment: PaymentState | null
  amountKobo: number | null
  items: OrderItem[]
  pickup: boolean
  // Extra money from this customer that pays no order, and what the shop decided.
  extra?: { state: Settlement['state']; amountKobo: number }[]
  // What is still owed after a payment that fell short.
  shortKobo?: number | null
}

// The engine decides; the model only words the decision. Each state becomes a
// plain statement the reply must convey, so the model never judges payments.
function paymentLine(facts: DraftFacts): string {
  const amount =
    facts.amountKobo === null ? '' : ` of ${formatNaira(facts.amountKobo)}`
  if (facts.payment === 'matched' && facts.shortKobo) {
    return `A payment has arrived, but it is ${formatNaira(facts.shortKobo)} short of the total${amount}. Thank the customer and ask politely for the balance of ${formatNaira(facts.shortKobo)}.`
  }
  switch (facts.payment) {
    case 'matched':
      return `The payment${amount} has arrived in the shop's account. Thank the customer and confirm the order.`
    case 'not yet credited':
      return `The payment${amount} has not reached the shop's account yet. Say politely that you will confirm and send the order as soon as it lands.`
    case 'mismatch':
      return `The payment could not be confirmed against the shop's account. Ask politely whether they can check with their bank and resend the receipt.`
    case 'check':
      return `The shop is still confirming the payment. Say you will confirm shortly.`
    default:
      return facts.amountKobo === null
        ? 'No payment has been sent yet. Answer their latest message.'
        : `No payment has been sent yet. The total is ${formatNaira(facts.amountKobo)}; answer their latest message and give the total.`
  }
}

function extraLine(e: NonNullable<DraftFacts['extra']>[number]): string {
  const amount = formatNaira(e.amountKobo)
  switch (e.state) {
    case 'refund owed':
      return `They also sent an extra ${amount} that pays for nothing. Say it will be sent back to them.`
    case 'refunded':
      return `They had sent an extra ${amount}; it has been sent back to them.`
    case 'kept':
      return `They also sent an extra ${amount}; the shop is keeping it as credit for their next order.`
  }
}

export function draftPrompt(facts: DraftFacts, chat: string): string {
  const items = facts.items.map((i) => `${i.qty} x ${i.name}`).join(', ')
  return `You run a small Lagos shop and are replying to a customer on WhatsApp.
Facts to convey: ${[paymentLine(facts), ...(facts.extra ?? []).map(extraLine)].join(' ')}${items ? `\nOrder: ${items}.` : ''}${facts.pickup ? '\nThe customer will pick up from the shop.' : ''}
Write one short WhatsApp reply of one to three sentences, in the same language the customer uses (English or Nigerian Pidgin). Be warm and plain. Do not add facts, prices or promises that are not given here. Output only the reply text.

Chat:
${chat}`
}

// Customers are never accused. A draft that slips into that language is
// thrown away rather than shown.
const ACCUSING = /\b(fake|fraud\w*|scam\w*|forged?|counterfeit)\b/i

export function draftProblem(text: string): string | null {
  if (!text.trim()) return 'The draft came back empty.'
  if (ACCUSING.test(text)) return 'The draft used accusing words.'
  return null
}
