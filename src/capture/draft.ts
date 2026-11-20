import type { OrderItem, PaymentState } from '../ledger/types'
import { formatNaira } from '../verify/money'

export type DraftFacts = {
  payment: PaymentState | null
  amountKobo: number | null
  items: OrderItem[]
  pickup: boolean
}

// The engine decides; the model only words the decision. Each state becomes a
// plain statement the reply must convey, so the model never judges payments.
function paymentLine(facts: DraftFacts): string {
  const amount =
    facts.amountKobo === null ? '' : ` of ${formatNaira(facts.amountKobo)}`
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

export function draftPrompt(facts: DraftFacts, chat: string): string {
  const items = facts.items.map((i) => `${i.qty} x ${i.name}`).join(', ')
  return `You run a small Lagos shop and are replying to a customer on WhatsApp.
Facts to convey: ${paymentLine(facts)}${items ? `\nOrder: ${items}.` : ''}${facts.pickup ? '\nThe customer will pick up from the shop.' : ''}
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
