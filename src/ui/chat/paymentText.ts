import type { Order, PaymentState } from '../../ledger/types'
import { balanceKobo, paidKobo } from '../../ledger/ledger'
import { formatMoney } from '../../verify/money'
import type { Credit } from '../../verify/types'

const PAYMENT_LABEL: Record<PaymentState, string> = {
  awaiting: 'Awaiting payment',
  matched: 'Paid',
  'not yet credited': 'Not yet credited',
  mismatch: 'Does not match',
  check: 'Check this',
}

// The state label, sharpened by what has actually arrived against the total.
export function paymentText(order: Order, credits: Credit[]): string {
  const balance = balanceKobo(order, credits)
  if (
    balance !== null &&
    balance > 0 &&
    order.amountKobo !== null &&
    paidKobo(order, credits) >= order.amountKobo
  ) {
    return `Items paid, delivery ${formatMoney(balance)} to pay`
  }
  if (balance !== null && balance > 0) return `Short by ${formatMoney(balance)}`
  if (balance !== null && balance < 0) {
    return `Paid, ${formatMoney(-balance)} over`
  }
  return PAYMENT_LABEL[order.payment.state]
}
