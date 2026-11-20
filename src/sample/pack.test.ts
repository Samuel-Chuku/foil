import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { matcherLedger, newOrder, recordVerdict } from '../ledger/ledger'
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
})
