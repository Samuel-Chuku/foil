import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import {
  confirmCredit,
  matcherLedger,
  newOrder,
  recordVerdict,
} from '../ledger/ledger'
import { applyRefunds, moreFromPayer, settle } from '../ledger/settle'
import type { Order } from '../ledger/types'
import { parseAlert } from '../verify/alerts'
import { verifyReceipt } from '../verify/match'
import { toReceipt } from '../verify/receiptFields'
import type { Credit } from '../verify/types'
import { SAMPLE_CHATS, SAMPLE_EMAILS } from './pack'

// With every receipt read perfectly, each sample chat must reach its expected
// verdict. The demo then differs from this only by what the model misreads.
describe('sample pack', () => {
  const results = SAMPLE_EMAILS.map((e) => parseAlert(e, config))
  const credits = results.flatMap((r) =>
    r.status === 'parsed' ? [r.credit] : [],
  ) as Credit[]

  it('trusts only the bank sender', () => {
    expect(results.map((r) => r.status)).toEqual([
      'parsed',
      'untrusted',
      'parsed',
      'parsed',
      'parsed',
      'parsed',
      'parsed',
      'parsed',
    ])
  })

  // The chats are verified in pack order, each saved as an order, as a vendor
  // working down the list would: Emeka's receipt is only "already used" once
  // Adaeze's order holds it.
  const orders: Order[] = []
  for (const chat of SAMPLE_CHATS) {
    it(`${chat.id} is ${chat.expected}`, () => {
      const sample = chat.messages.find((m) => m.receipt)!.receipt!
      const receipt = toReceipt(sample, config)
      let order = newOrder(
        orders,
        {
          mode: 'everyday',
          customerId: chat.phone,
          items: [],
          amountKobo: null,
        },
        0,
      )
      const verdict = verifyReceipt(
        receipt,
        matcherLedger(orders, credits, config, order.id),
        config,
      )
      order = recordVerdict(order, receipt, verdict, 0)
      orders.push(order)
      expect(verdict.kind).toBe(chat.expected)
      if (verdict.kind === 'check') expect(verdict.candidates).toHaveLength(2)
    })
  }

  // Kemi paid twice: the vendor picks one credit, owes her the other back,
  // and the transfer out in the alerts confirms the refund.
  it('kemi gets her second payment refunded', () => {
    const kemi = orders.at(-1)!
    const before = orders.slice(0, -1)
    const paid = confirmCredit(
      kemi,
      'e6',
      matcherLedger(before, credits, config, kemi.id),
      0,
    )
    if (!paid.ok) throw new Error(paid.reason)
    const day = matcherLedger([...before, paid.order], credits, config)
    const extra = moreFromPayer(
      credits.find((c) => c.id === 'e6')!,
      day,
      config,
    )
    expect(extra.map((c) => c.id)).toEqual(['e7'])
    const owed = settle(extra[0]!, 'refund owed', kemi.customerId, 0)
    expect(applyRefunds([owed], credits, config, 1)).toMatchObject([
      { id: 'e7', state: 'refunded', refundId: 'e8' },
    ])
  })
})
