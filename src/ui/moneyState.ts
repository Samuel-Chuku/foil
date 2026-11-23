import type { PaymentState } from '../ledger/types'

// The five money states every payment is drawn in. Lime (landed) is kept for
// money the vendor's own bank has confirmed, and nothing else.
export type MoneyState = 'waiting' | 'claimed' | 'landed' | 'check' | 'mismatch'

export const MONEY_STATE: Record<PaymentState, MoneyState> = {
  awaiting: 'waiting',
  'not yet credited': 'claimed',
  matched: 'landed',
  check: 'check',
  mismatch: 'mismatch',
}
