import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { newOrder, recordVerdict } from '../ledger/ledger'
import type { Receipt } from '../verify/types'
import {
  followUpFacts,
  formatWait,
  PAYER_NAME_ASK,
  waitingMin,
} from './followUp'

const at = (h: number, m: number) => Date.UTC(2026, 10, 21, h, m)
const ID = '000014261121124501730268159843'

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  amountKobo: 1_200_000,
  sender: 'TUNDE BAKARE',
  senderBank: 'access',
  reference: ID,
  at: { ms: at(12, 45), precision: 'minute' },
  status: 'successful',
  ...over,
})

const waiting = (r: Receipt, reason = 'No credit has arrived yet.') =>
  recordVerdict(
    newOrder(
      [],
      { mode: 'everyday', customerId: null, items: [], amountKobo: 1_200_000 },
      0,
    ),
    r,
    { kind: 'not yet credited', reason },
    0,
  )

describe('payment follow-up', () => {
  it('says nothing while the wait is still short', () => {
    expect(followUpFacts(waiting(receipt()), at(13, 15), 60, config)).toEqual(
      [],
    )
    expect(waitingMin(waiting(receipt()), at(13, 15))).toBe(30)
  })

  it('suggests checking with the bank, with the session ID, after the wait', () => {
    const [line] = followUpFacts(waiting(receipt()), at(15, 30), 60, config)
    expect(line).toContain('after more than 1 h')
    expect(line).toContain('using the session ID on their receipt')
    expect(line).not.toContain(ID)
    expect(line).not.toMatch(/fake|fraud/i)
  })

  it('asks for the session ID when the receipt has none that can be read', () => {
    const lines = followUpFacts(
      waiting(receipt({ reference: '' })),
      at(13, 0),
      60,
      config,
    )
    expect(lines).toEqual([
      "Ask them to send the session ID from the transfer's details in their bank app, so the shop can trace it.",
    ])
  })

  it('does not ask for an ID on a same-bank transfer', () => {
    const same = receipt({ senderBank: 'gtbank', reference: '' })
    expect(
      followUpFacts(waiting(same), at(13, 0), 60, config, ['gtbank']),
    ).toEqual([])
  })

  it("does not ask for an ID the customer's bank never prints", () => {
    const palm = receipt({ senderBank: 'palmpay', reference: '' })
    expect(followUpFacts(waiting(palm), at(13, 0), 60, config)).toEqual([])
  })

  it('asks them to send again after a reversal', () => {
    const lines = followUpFacts(
      waiting(
        receipt(),
        'A credit arrived for this receipt, but the bank later reversed it, so it is not paid.',
      ),
      at(15, 0),
      60,
      config,
    )
    expect(lines[0]).toContain('send it again')
  })

  it('formats waits plainly', () => {
    expect(formatWait(45)).toBe('45 min')
    expect(formatWait(120)).toBe('2 h')
  })
})

describe('money from a different name', () => {
  const asked = recordVerdict(
    waiting(receipt()),
    receipt(),
    { kind: 'check', reason: '', candidates: ['c1'], why: 'name' },
    0,
  )

  it('asks whose account paid, without suggesting anything is wrong', () => {
    const lines = followUpFacts(asked, at(12, 50), 30, config)
    expect(lines).toContain(PAYER_NAME_ASK)
    expect(lines.join(' ')).not.toMatch(/fake|fraud/i)
  })

  it('asks which account they paid from once the vendor says not theirs', () => {
    const declined = {
      ...asked,
      payment: {
        ...asked.payment,
        state: 'not yet credited' as const,
        candidates: [],
        declinedIds: ['c1'],
      },
    }
    expect(followUpFacts(declined, at(12, 50), 30, config).join(' ')).toMatch(
      /which account they paid from/,
    )
  })
})
