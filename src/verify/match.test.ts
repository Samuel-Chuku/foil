import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { findReversedCredits, verifyReceipt, type Ledger } from './match'
import type { Credit, Receipt } from './types'

// Synthetic payments only. 21 Nov 2026, Lagos wall-clock.
const at = (h: number, m: number, s = 0) => Date.UTC(2026, 10, 21, h, m, s)
// OPay (100004) session ID stamped one hour behind WAT, as some banks do.
const OPAY_ID = '100004261121100212000000000123'

const credit = (over: Partial<Credit> = {}): Credit => ({
  id: 'c1',
  bank: 'gtbank',
  direction: 'credit',
  reversal: false,
  amountKobo: 1_850_000,
  sender: 'ADAEZE OKAFOR',
  narration: '',
  sessionId: null,
  reference: null,
  at: { ms: at(11, 2, 30), precision: 'second' },
  source: 'alert',
  strength: 'alert received',
  ...over,
})

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  amountKobo: 1_850_000,
  sender: 'Adaeze Okafor',
  senderBank: 'opay',
  reference: OPAY_ID,
  at: { ms: at(11, 2), precision: 'minute' },
  status: 'successful',
  ...over,
})

const ledger = (credits: Credit[], over: Partial<Ledger> = {}): Ledger => ({
  credits,
  claimedCredits: new Map(),
  usedSessionIds: new Map(),
  reversedCredits: new Set(),
  ...over,
})

describe('verifyReceipt: interbank', () => {
  it('matches on amount, name and time', () => {
    expect(verifyReceipt(receipt(), ledger([credit()]), config)).toMatchObject({
      kind: 'matched',
      creditId: 'c1',
    })
  })

  it('matches on the session ID even when the alert names someone else', () => {
    const v = verifyReceipt(
      receipt(),
      ledger([credit({ sender: 'AO VENTURES', sessionId: OPAY_ID })]),
      config,
    )
    expect(v.kind).toBe('matched')
  })

  it('says not yet credited when no credit has arrived', () => {
    expect(verifyReceipt(receipt(), ledger([]), config).kind).toBe(
      'not yet credited',
    )
  })

  it('flags a session ID from a different bank than the receipt', () => {
    const v = verifyReceipt(
      receipt({ senderBank: 'kuda' }),
      ledger([credit()]),
      config,
    )
    expect(v).toMatchObject({ kind: 'mismatch' })
    if (v.kind === 'mismatch') expect(v.reason).toMatch(/OPay.*Kuda/)
  })

  it('flags a session ID whose time disagrees with the receipt', () => {
    const v = verifyReceipt(
      receipt({ at: { ms: at(15, 40), precision: 'minute' } }),
      ledger([credit()]),
      config,
    )
    expect(v.kind).toBe('mismatch')
  })

  it('flags a session ID already used on another order', () => {
    const v = verifyReceipt(
      receipt(),
      ledger([credit()], { usedSessionIds: new Map([[OPAY_ID, 'A12']]) }),
      config,
    )
    expect(v).toMatchObject({ kind: 'mismatch' })
    if (v.kind === 'mismatch') expect(v.reason).toContain('A12')
  })

  it('catches a reused ID even when one digit was misread', () => {
    const misread = OPAY_ID.replace(/3$/, '8')
    const v = verifyReceipt(
      receipt({ reference: misread }),
      ledger([credit()], { usedSessionIds: new Map([[OPAY_ID, 'A12']]) }),
      config,
    )
    expect(v.kind).toBe('mismatch')
  })

  it('asks the vendor to check an unreadable ID instead of calling it a mismatch', () => {
    const v = verifyReceipt(
      receipt({ reference: OPAY_ID.slice(1) }),
      ledger([credit()]),
      config,
    )
    expect(v).toMatchObject({ kind: 'check', candidates: ['c1'] })
  })

  it('asks the vendor to check an interbank receipt with no ID', () => {
    const v = verifyReceipt(
      receipt({ reference: '' }),
      ledger([credit()]),
      config,
    )
    expect(v.kind).toBe('check')
  })

  it('reports a credit that came from a different name', () => {
    const v = verifyReceipt(
      receipt(),
      ledger([credit({ sender: 'IFEOMA NWOSU' })]),
      config,
    )
    expect(v.kind).toBe('mismatch')
  })

  it('rejects an alert whose session ID belongs to another transfer', () => {
    const other = '100004261121100212000000000999'
    expect(
      verifyReceipt(receipt(), ledger([credit({ sessionId: other })]), config)
        .kind,
    ).toBe('not yet credited')
  })
})

describe('verifyReceipt: same bank', () => {
  const sameBank = (over: Partial<Receipt> = {}) =>
    receipt({ senderBank: 'gtbank', reference: 'GTB/INT/55120098', ...over })

  it('matches without a session ID inside the tight window', () => {
    expect(verifyReceipt(sameBank(), ledger([credit()]), config).kind).toBe(
      'matched',
    )
  })

  it('does not match a same-bank credit far outside the window', () => {
    const late = credit({ at: { ms: at(11, 30), precision: 'second' } })
    expect(verifyReceipt(sameBank(), ledger([late]), config).kind).not.toBe(
      'matched',
    )
  })
})

describe('verifyReceipt: one credit, one order', () => {
  it('refuses a credit that already pays for another order', () => {
    const v = verifyReceipt(
      receipt(),
      ledger([credit()], { claimedCredits: new Map([['c1', 'A07']]) }),
      config,
    )
    expect(v).toMatchObject({ kind: 'mismatch' })
  })

  it('asks the vendor when two credits fit equally', () => {
    const v = verifyReceipt(
      receipt(),
      ledger([credit(), credit({ id: 'c2' })]),
      config,
    )
    expect(v).toMatchObject({ kind: 'check', candidates: ['c1', 'c2'] })
  })

  it('prefers the credit whose session ID agrees', () => {
    const v = verifyReceipt(
      receipt(),
      ledger([credit(), credit({ id: 'c2', sessionId: OPAY_ID })]),
      config,
    )
    expect(v).toMatchObject({ kind: 'matched', creditId: 'c2' })
  })
})

describe('receipt status, reversals', () => {
  it('treats a pending receipt as not yet credited', () => {
    expect(
      verifyReceipt(receipt({ status: 'pending' }), ledger([credit()]), config)
        .kind,
    ).toBe('not yet credited')
  })

  it('treats a failed receipt as a mismatch', () => {
    expect(
      verifyReceipt(receipt({ status: 'failed' }), ledger([credit()]), config)
        .kind,
    ).toBe('mismatch')
  })

  it('finds the credit a reversal cancels, and stops matching it', () => {
    const reversal = credit({
      id: 'r1',
      direction: 'debit',
      reversal: true,
      sender: 'REVERSAL ADAEZE OKAFOR',
      at: { ms: at(14, 0), precision: 'second' },
    })
    const credits = [credit(), reversal]
    const reversed = findReversedCredits(credits, config)
    expect([...reversed]).toEqual(['c1'])
    expect(
      verifyReceipt(
        receipt(),
        ledger(credits, { reversedCredits: reversed }),
        config,
      ).kind,
    ).toBe('not yet credited')
  })

  it('never uses the words fake or fraud', () => {
    const cases = [
      receipt({ senderBank: 'kuda' }),
      receipt({ status: 'failed' }),
      receipt({ at: { ms: at(15, 40), precision: 'minute' } }),
    ]
    for (const r of cases) {
      expect(
        JSON.stringify(verifyReceipt(r, ledger([credit()]), config)),
      ).not.toMatch(/fake|fraud/i)
    }
  })
})
