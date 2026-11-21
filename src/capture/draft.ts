import type { OrderItem, PaymentState, Settlement } from '../ledger/types'
import { formatNaira } from '../verify/money'

export type DraftFacts = {
  payment: PaymentState | null
  amountKobo: number | null
  items: OrderItem[]
  // What the reply must say about delivery (see delivery.ts).
  delivery?: string[]
  // What the shop's stock says about what they asked for (stock.ts).
  stock?: string[]
  // What to ask of a customer whose payment has not landed (followUp.ts).
  followUp?: string[]
  // Extra money from this customer that pays no order, and what the shop decided.
  // `hasAccount`: the customer has already said where a refund should go.
  extra?: {
    state: Settlement['state']
    amountKobo: number
    hasAccount?: boolean
  }[]
  // What is still owed after a payment that fell short.
  shortKobo?: number | null
  // The items are paid and only the delivery fee is still owed.
  deliveryOwed?: boolean
  // The shop's own terms that may bear on this reply (see shopRules.ts).
  rules?: string[]
  // The waiting-queue sort marked their latest messages as a complaint.
  complaint?: boolean
}

// The engine decides; the model only words the decision. Each state becomes a
// plain statement the reply must convey, so the model never judges payments.
function paymentLine(facts: DraftFacts): string {
  const amount =
    facts.amountKobo === null ? '' : ` of ${formatNaira(facts.amountKobo)}`
  if (facts.payment === 'matched' && facts.shortKobo && facts.deliveryOwed) {
    return `The payment for the items has arrived. Thank the customer and ask them to send the delivery fee of ${formatNaira(facts.shortKobo)}, which is still to pay.`
  }
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
    // Before any payment, the customer is still asking; telling them they
    // have not paid reads as a complaint.
    default:
      return facts.amountKobo === null
        ? 'Answer their latest message. Do not mention payment.'
        : `Answer their latest message and give the price of ${formatNaira(facts.amountKobo)}. Do not say that they have not paid.`
  }
}

function extraLine(e: NonNullable<DraftFacts['extra']>[number]): string {
  const amount = formatNaira(e.amountKobo)
  switch (e.state) {
    case 'refund owed':
      return e.hasAccount
        ? `They also sent an extra ${amount}. Say it will be sent back to the account they gave.`
        : `They also sent an extra ${amount}. Ask for the account number, bank and account name to send it back to, or whether they would rather keep it as credit for their next order. If the chat already gives an account, thank them and say it will be sent there instead.`
    case 'refunded':
      return `They had sent an extra ${amount}; it has been sent back to them.`
    case 'kept':
      return `They also sent an extra ${amount}; the shop is keeping it as credit for their next order.`
  }
}

const COMPLAINT =
  'The customer is unhappy about something. Reply calmly and kindly: acknowledge what went wrong, apologise, do not argue or blame them, and say the shop is looking into it and will get back to them. Do not promise a refund, replacement or discount unless the shop rules below give one.'

export function draftPrompt(facts: DraftFacts, chat: string): string {
  const items = facts.items.map((i) => `${i.qty} x ${i.name}`).join(', ')
  return `You run a small Lagos shop and are replying to a customer on WhatsApp.
Facts to convey: ${[...(facts.complaint ? [COMPLAINT] : []), paymentLine(facts), ...(facts.stock ?? []), ...(facts.followUp ?? []), ...(facts.extra ?? []).map(extraLine)].join(' ')}${items ? `\nOrder: ${items}.` : ''}${facts.delivery?.length ? `\nDelivery: ${facts.delivery.join(' ')}` : ''}${facts.rules?.length ? `\nShop rules. If the customer asks about anything these cover, such as a delivery fee, answer from them:\n${facts.rules.join('\n')}` : ''}
Write one short WhatsApp reply of one to three sentences that conveys the facts and answers any question in the customer's latest messages, in the same language the customer uses (English or Nigerian Pidgin). Be warm and plain. Do not add facts, prices, fees, hours or promises that are not given here. Output only the reply text.

Chat:
${chat}`
}

// Models sometimes wrap the whole reply in quotation marks.
export function tidyDraft(text: string): string {
  const t = text.trim()
  const m = /^["“'‘]([\s\S]*)["”'’]$/.exec(t)
  return (m ? m[1]! : t).trim()
}

// Customers are never accused. A draft that slips into that language is
// thrown away rather than shown.
const ACCUSING = /\b(fake|fraud\w*|scam\w*|forged?|counterfeit)\b/i

export function draftProblem(text: string): string | null {
  if (!text.trim()) return 'The draft came back empty.'
  if (ACCUSING.test(text)) return 'The draft used accusing words.'
  return null
}
