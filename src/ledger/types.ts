import type { Fingerprint } from '../capture/imageMatch'
import type { Verdict } from '../verify/match'
import type { DeliveryMethod } from '../capture/shopRules'
import type { Receipt } from '../verify/types'

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

export type OrderItem = {
  name: string
  qty: number
  priceKobo: number | null
  // The stock item this line is, when it was matched by photo or picked by
  // the vendor; otherwise it is found by name.
  productId?: string
}

export type PaymentState = 'awaiting' | Verdict['kind']

export type Payment = {
  state: PaymentState
  reason: string | null
  creditId: string | null
  // Session ID digits of the accepted receipt, so the same receipt cannot pay twice.
  sessionId: string | null
  // Credit ids the vendor can choose between when the rules cannot decide.
  candidates: string[]
  // Later credits that pay the balance of a short payment.
  topUpIds: string[]
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
  // The receipt the payment was last checked against, kept on the device so
  // the order can be checked again when new money arrives. It holds the
  // payer's name and never goes into the books.
  receipt: Receipt | null
  // How this order travels, once the customer has said. Null until delivery
  // comes up in the chat: nothing is added to an order by default.
  deliveryPlan: DeliveryPlan | null
  delivery: 'pending' | 'out' | 'delivered' | 'collected'
  createdAt: number
  updatedAt: number
  // Drop mode: when the customer asked for the item (from their message),
  // which sets their place in line, and when the vendor ended their hold.
  claimedAt?: number
  releasedAt?: number
}

// The books: amounts, states and times, never who or where.
export type BookEntry = {
  orderId: string
  mode: Order['mode']
  amountKobo: number | null
  // What the shop collects (items plus any delivery paid to it) and what has
  // arrived so far, so a part payment shows in the books.
  dueKobo: number | null
  paidKobo: number
  payment: PaymentState
  decidedBy: Payment['decidedBy']
  delivery: Order['delivery']
  createdAt: number
  updatedAt: number
  paidAt: number | null
}

// A decision about money that pays no order, for the books: the amount and
// what became of it. Never who sent it or where a refund goes.
export type MoneyEntry = {
  id: string
  amountKobo: number
  state: Settlement['state']
  // When the money arrived, Lagos wall-clock; null if the bank gave no time.
  arrivedAt: number | null
  updatedAt: number
}

// What the vendor decided about money that pays no order, usually a customer
// paying twice. Recorded only; the desk never moves money.
export type Settlement = {
  // The credit id for a whole credit, or "<credit id>:over" for the part of a
  // credit that paid more than its order.
  id: string
  creditId: string
  amountKobo: number
  state: 'refund owed' | 'refunded' | 'kept'
  // Whose money it is, when the vendor decided from that customer's chat.
  customerId: string | null
  // The outgoing debit alert that showed the refund was sent.
  refundId: string | null
  // Where the customer asked for a refund to go, checked by the vendor.
  refundTo?: RefundTo
  decidedBy: 'rules' | 'vendor'
  updatedAt: number
}

export type RefundTo = {
  accountNumber: string
  bank: string
  accountName: string
}

export type DeliveryPlan = {
  // Null while the customer has not chosen.
  method: DeliveryMethod | null
  // A city area for a rider or courier.
  area: string
  // Another state and its park, for nationwide delivery.
  state: string
  park: string
  // Null until known: a courier quote, or a state with no set price.
  feeKobo: number | null
  // Who collects the fee: the shop, with the order's payment, or the rider on
  // delivery. Null when nobody has said.
  paidTo: 'shop' | 'rider' | null
}

// Something the shop sells. Drop mode's one-of-a-kind items are products with
// a quantity of one.
export type Product = {
  id: string
  name: string
  priceKobo: number | null
  // How many the shop had when it last counted; null when it does not count.
  qty: number | null
  // Paid orders after this time reduce the count; earlier ones were already
  // gone when the vendor counted.
  countedAt: number
  updatedAt: number
  // A photo of the item, for shops that sell by picture rather than name.
  photo?: ProductPhoto
  // A drop's one-of-a-kind item, and its number in that drop.
  dropId?: string
  dropNo?: number
  // Where the vendor placed it in their list; lower comes first.
  rank?: number
}

// A timed status sale of one-of-a-kind items.
export type Drop = {
  id: string
  name: string
  // How long a claim is held for payment before it passes on.
  holdMin: number
  createdAt: number
  endedAt: number | null
}

export type ProductPhoto = {
  // A small JPEG data URL for the vendor's screens.
  thumb: string
  // What customer pictures are matched against (see imageMatch.ts).
  print: Fingerprint
}

// Which Gmail accounts the extension reads bank alerts from, and how the
// search is limited. Kept on the device; access tokens are never stored.
export type GmailSettings = {
  accounts: { email: string }[]
  // A Gmail label the vendor files alerts under; empty means the known bank
  // sender addresses instead.
  label: string
}

// What a message from a customer is about, from the waiting-queue sort.
export type MessageLabel =
  'order' | 'payment' | 'question' | 'complaint' | 'other'

// The last thing the desk read in a customer's chat, kept on the device so
// the queue can show who is waiting without reading WhatsApp again.
export type ChatNote = {
  // The customer key: their number, or "name:<contact>".
  id: string
  name: string
  // Their latest messages as read, newest last, text only.
  recent: { from: 'customer' | 'vendor'; time: string; text: string }[]
  lastFrom: 'customer' | 'vendor'
  readAt: number
  // The sort's label for their latest messages, and which messages it saw.
  label?: MessageLabel
  labelledText?: string
}
