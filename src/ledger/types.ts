import type { Verdict } from '../verify/match'

// Everything in this file lives in IndexedDB on the vendor's device only.
// Firestore receives a BookEntry, which carries none of the people fields.

export type Customer = {
  // The phone number in international form, which is how WhatsApp keys a chat.
  id: string
  name: string
  address: string
  landmark: string
  area: string
  updatedAt: number
}

export type OrderItem = { name: string; qty: number; priceKobo: number | null }

export type PaymentState = 'awaiting' | Verdict['kind']

export type Payment = {
  state: PaymentState
  reason: string | null
  creditId: string | null
  // Session ID digits of the accepted receipt, so the same receipt cannot pay twice.
  sessionId: string | null
  // Credit ids the vendor can choose between when the rules cannot decide.
  candidates: string[]
  decidedBy: 'rules' | 'vendor' | null
  checkedAt: number | null
}

export type Order = {
  id: string
  // Short number the vendor reads out and that verdicts quote ("order 12").
  code: string
  mode: 'everyday' | 'drop'
  customerId: string | null
  items: OrderItem[]
  amountKobo: number | null
  payment: Payment
  delivery: 'pending' | 'out' | 'delivered' | 'collected'
  createdAt: number
  updatedAt: number
}

// The books: amounts, states and times, never who or where.
export type BookEntry = {
  orderId: string
  mode: Order['mode']
  amountKobo: number | null
  payment: PaymentState
  decidedBy: Payment['decidedBy']
  delivery: Order['delivery']
  createdAt: number
  updatedAt: number
  paidAt: number | null
}
