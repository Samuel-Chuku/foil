import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import {
  applyVerdict,
  balanceKobo,
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
import { historyCredits, newHistoryCredits } from '../verify/history'
import {
  SAMPLE_CHATS,
  SAMPLE_DAY_MS,
  SAMPLE_EMAILS,
  SAMPLE_HISTORY,
} from './pack'

// With every receipt read perfectly, each sample chat must reach its expected
// verdict. The demo then differs from this only by what the model misreads.
describe('sample pack', () => {
  const results = SAMPLE_EMAILS.map((e) => parseAlert(e, config))
  const alerts = results.flatMap((r) =>
    r.status === 'parsed' ? [r.credit] : [],
  ) as Credit[]
  // The bank-app screenshot adds only what the alerts missed: Femi's credit.
  const fromApp = newHistoryCredits(
    alerts,
    historyCredits(SAMPLE_HISTORY.rows, {
      screenshotId: 'h1',
      bank: SAMPLE_HISTORY.bank,
      day: SAMPLE_DAY_MS,
    }),
  )
  const credits = [...alerts, ...fromApp]

  it('takes only new money from the bank-app screenshot', () => {
    expect(fromApp.map((c) => c.amountKobo)).toEqual([2_200_000])
  })

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
    const phone = SAMPLE_CHATS.find((c) => c.id === 'kemi')!.phone
    const kemi = orders.find((o) => o.customerId === phone)!
    const before = orders.filter((o) => o !== kemi)
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

  // Ngozi pays ₦500 short of ₦12,500, then sends the balance.
  it('ngozi short payment is completed by her second receipt', () => {
    const chat = SAMPLE_CHATS.find((c) => c.id === 'ngozi')!
    const [firstPay, balancePay] = chat.messages.flatMap((m) =>
      m.receipt ? [toReceipt(m.receipt, config)] : [],
    )
    const others = orders.filter((o) => o.customerId !== chat.phone)
    let order = {
      ...newOrder(
        others,
        {
          mode: 'everyday',
          customerId: chat.phone,
          items: [],
          amountKobo: 1_250_000,
        },
        0,
      ),
    }
    for (const r of [firstPay!, balancePay!]) {
      const verdict = verifyReceipt(
        r,
        matcherLedger(others, credits, config, order.id),
        config,
      )
      expect(verdict.kind).toBe('matched')
      order = applyVerdict(order, r, verdict, credits, 0) ?? order
    }
    expect(order.payment.topUpIds).toEqual(['e10'])
    expect(balanceKobo(order, credits)).toBe(0)
  })
})
