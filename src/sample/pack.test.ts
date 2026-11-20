import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { matcherLedger } from '../ledger/ledger'
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
    ])
  })

  for (const chat of SAMPLE_CHATS) {
    it(`${chat.id} is ${chat.expected}`, () => {
      const sample = chat.messages.find((m) => m.receipt)!.receipt!
      const receipt = toReceipt(sample, config)
      const verdict = verifyReceipt(
        receipt,
        matcherLedger([], credits, config),
        config,
      )
      expect(verdict.kind).toBe(chat.expected)
    })
  }
})
