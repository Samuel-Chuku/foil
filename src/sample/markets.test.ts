import { afterAll, describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY } from '../config/defaults'
import { setMarket, type MarketId } from '../config/market'
import { verifyFor } from '../config/marketBanks'
import { matcherLedger, newOrder, recordVerdict } from '../ledger/ledger'
import type { Order } from '../ledger/types'
import { parseAlert } from '../verify/alerts'
import { verifyReceipt } from '../verify/match'
import { toReceipt } from '../verify/receiptFields'
import type { Credit } from '../verify/types'
import { PACKS } from './markets'

// With every receipt read perfectly, each market's sample chats reach their
// expected verdicts on the rules alone, before late alerts arrive.
afterAll(() => setMarket('ng'))

for (const id of ['in', 'br'] as MarketId[]) {
  describe(`sample day: ${PACKS[id].shop}`, () => {
    const pack = PACKS[id]
    const setUp = () => {
      setMarket(id)
      return verifyFor(DEFAULT_VERIFY)
    }

    it('reads every on-time alert, and trusts only the shop bank', () => {
      const config = setUp()
      const results = pack.emails
        .filter((e) => !e.later)
        .map((e) => parseAlert(e, config))
      for (const r of results) {
        expect(['parsed', 'untrusted']).toContain(r.status)
      }
      expect(results.some((r) => r.status === 'parsed')).toBe(true)
    })

    const orders: Order[] = []
    for (const chat of pack.chats.filter((c) => c.expected !== 'awaiting')) {
      it(`${chat.id} is ${chat.expected}`, () => {
        const config = setUp()
        const credits = pack.emails
          .filter((e) => !e.later)
          .map((e) => parseAlert(e, config))
          .flatMap((r) => (r.status === 'parsed' ? [r.credit] : [])) as Credit[]
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
      })
    }

    it('turns late money into a match once its alert arrives', () => {
      const config = setUp()
      const credits = pack.emails
        .map((e) => parseAlert(e, config))
        .flatMap((r) => (r.status === 'parsed' ? [r.credit] : [])) as Credit[]
      const late = pack.chats.find(
        (c) =>
          c.expected === 'not yet credited' &&
          c.messages.some((m) => m.receipt?.sessionId),
      )!
      const receipt = toReceipt(
        late.messages.find((m) => m.receipt)!.receipt!,
        config,
      )
      expect(
        verifyReceipt(receipt, matcherLedger([], credits, config), config).kind,
      ).toBe('matched')
    })
  })
}
