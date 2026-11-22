import { itemState, roleOf } from '../capture/drop'
import { balanceKobo } from '../ledger/ledger'
import type { ChatNote, Customer, Drop, Order, Product } from '../ledger/types'
import type { Credit } from '../verify/types'

// The waiting queue: every customer the desk knows, in the one section that
// most needs the vendor, decided by rules from the orders and the last read
// of each chat. The model only labels messages (see triage.ts).

const KEEP = 6

// What is kept of a chat once read: its last few text messages. The label
// stays only while the customer's latest words are the ones it was given for.
export function noteFrom(
  key: string,
  name: string,
  messages: {
    from: 'customer' | 'vendor'
    time: string
    text?: string
    voice?: unknown
  }[],
  now: number,
  before?: ChatNote,
): ChatNote | null {
  // A voice note counts as a message, so a customer who only sent one is
  // still sorted and shown as waiting.
  const said = (m: (typeof messages)[number]) =>
    m.text?.trim() || (m.voice ? '[sent a voice note]' : '')
  const recent = messages
    .filter((m) => said(m))
    .slice(-KEEP)
    .map((m) => ({ from: m.from, time: m.time, text: said(m) }))
  const last = messages.at(-1)
  if (!last) return null
  const note: ChatNote = {
    id: key,
    name,
    recent,
    lastFrom: last.from,
    readAt: now,
  }
  const asked = latestAsk(note)
  if (before?.label && before.labelledText === asked) {
    note.label = before.label
    note.labelledText = asked
  }
  return note
}

// The customer's messages since the vendor last wrote: what a reply answers.
export function latestAsk(note: ChatNote): string {
  const lastVendor = note.recent.findLastIndex((m) => m.from === 'vendor')
  return note.recent
    .slice(lastVendor + 1)
    .filter((m) => m.from === 'customer')
    .map((m) => m.text)
    .join('\n')
}

export type Section =
  'complaint' | 'claim' | 'unpaid' | 'details' | 'reply' | 'ready' | 'done'

export const SECTION_TITLE: Record<Section, string> = {
  complaint: 'Complaints',
  claim: 'Drop claims',
  unpaid: 'Waiting on payment',
  details: 'Need delivery details',
  reply: 'Waiting for your reply',
  ready: 'Paid, ready to send',
  done: 'Done',
}

const ORDER: Section[] = [
  'complaint',
  'claim',
  'unpaid',
  'details',
  'reply',
  'ready',
  'done',
]

export type QueueEntry = {
  key: string
  name: string
  section: Section
  // One line on why they are here.
  why: string
  order: Order | null
  label?: ChatNote['label']
}

const DONE = new Set<Order['delivery']>(['delivered', 'collected'])

export function buildQueue(input: {
  orders: Order[]
  credits: Credit[]
  customers: Customer[]
  chats: ChatNote[]
  drops: Drop[]
  products: Product[]
  // Whether the shop delivers at all; a shop that does not never needs
  // delivery details.
  delivers: boolean
  now: number
}): QueueEntry[] {
  const { orders, chats, now } = input
  const keys = new Set([
    ...chats.map((c) => c.id),
    ...orders.flatMap((o) => (o.customerId ? [o.customerId] : [])),
  ])
  const entries: QueueEntry[] = []
  for (const key of keys) {
    const chat = chats.find((c) => c.id === key)
    const theirs = orders
      .filter((o) => o.customerId === key)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const open = theirs.find((o) => !DONE.has(o.delivery)) ?? null
    const name =
      input.customers.find((c) => c.id === key)?.name ||
      chat?.name ||
      (key.startsWith('name:') ? key.slice(5) : key)
    const add = (section: Section, why: string, order = open) =>
      entries.push({ key, name, section, why, order, label: chat?.label })

    const waiting = chat?.lastFrom === 'customer'
    if (chat?.label === 'complaint' && waiting) {
      add('complaint', 'Their latest message sounds unhappy.')
      continue
    }
    if (open) {
      const claim = claimLine(open, input)
      if (claim) {
        add('claim', claim)
        continue
      }
      const p = open.payment.state
      const balance = balanceKobo(open, input.credits)
      if (p !== 'matched') {
        add('unpaid', PAYMENT_WHY[p])
        continue
      }
      if (balance !== null && balance > 0) {
        add('unpaid', 'Paid part; a balance is still owed.')
        continue
      }
      if (input.delivers && open.deliveryPlan === null) {
        add('details', 'Paid; how it reaches them is not settled yet.')
        continue
      }
      if (waiting) {
        add('reply', 'Paid; they have written since your last message.')
        continue
      }
      add('ready', 'Paid and settled; ready to send or hand over.')
      continue
    }
    if (waiting) {
      add('reply', 'They wrote last and have no open order.')
      continue
    }
    const last = theirs[0]
    if (last && DONE.has(last.delivery) && now - last.updatedAt < DAY) {
      add('done', 'Delivered or collected today.', last)
    }
  }
  return entries.sort(
    (a, b) =>
      ORDER.indexOf(a.section) - ORDER.indexOf(b.section) ||
      (b.order?.updatedAt ?? 0) - (a.order?.updatedAt ?? 0),
  )
}

const DAY = 24 * 60 * 60 * 1000

const PAYMENT_WHY: Record<Order['payment']['state'], string> = {
  awaiting: 'Order taken; no payment yet.',
  'not yet credited': 'Their transfer has not reached you yet.',
  check: 'A payment needs you to pick the credit.',
  mismatch: 'Their receipt did not match your account.',
  matched: '',
}

function claimLine(
  order: Order,
  input: { orders: Order[]; drops: Drop[]; products: Product[]; now: number },
): string | null {
  for (const item of order.items) {
    const product = input.products.find((p) => p.id === item.productId)
    if (!product?.dropId) continue
    const drop = input.drops.find((d) => d.id === product.dropId)
    if (!drop) continue
    const state = itemState(product, input.orders, drop.holdMin, input.now)
    const role = roleOf(state, order.id)
    const it = `#${product.dropNo}`
    switch (role?.role) {
      case 'holder':
        return `Holding ${it}; payment not in yet.`
      case 'waiting':
        return `Number ${role.place} in line for ${it}.`
      case 'paidWaiting':
        return `Paid for ${it} while someone else holds it.`
      case 'refund':
        return `Paid for ${it} after it went to someone else: refund owed.`
      case 'released':
        return `Their hold on ${it} ran out.`
      case 'lost':
        return `${it} went to someone else.`
      default:
        break
    }
  }
  return null
}
