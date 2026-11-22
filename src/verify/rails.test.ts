import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY } from '../config/defaults'
import { setMarket } from '../config/market'
import { verifyFor } from '../config/marketBanks'
import { parseAlert } from './alerts'
import { verifyReceipt, type Ledger } from './match'
import { decodeSessionId } from './sessionId'
import type { Credit, Receipt } from './types'

// Synthetic transfers only. Times are local wall-clock (Mumbai, São Paulo).
const at = (h: number, m: number) => ({
  ms: Date.UTC(2026, 10, 21, h, m),
  precision: 'minute' as const,
})
const ledger = (credits: Credit[], over: Partial<Ledger> = {}): Ledger => ({
  credits,
  claimedCredits: new Map(),
  usedSessionIds: new Map(),
  reversedCredits: new Set(),
  ...over,
})
const credit = (over: Partial<Credit>): Credit => ({
  id: 'c1',
  bank: null,
  direction: 'credit',
  reversal: false,
  amountKobo: 185_000,
  sender: '',
  narration: '',
  sessionId: null,
  reference: null,
  at: at(15, 43),
  source: 'alert',
  strength: 'alert received',
  ...over,
})
const receipt = (over: Partial<Receipt>): Receipt => ({
  amountKobo: 185_000,
  sender: '',
  senderBank: null,
  reference: '',
  at: at(15, 42),
  status: 'successful',
  ...over,
})

afterEach(() => setMarket('ng'))

describe('UPI (Mumbai)', () => {
  beforeEach(() => setMarket('in'))
  const config = () => verifyFor(DEFAULT_VERIFY)
  const UTR = '632514789012'

  it('reads a 12-digit UPI reference, with no bank or time inside it', () => {
    expect(decodeSessionId(`UPI transaction ID: ${UTR}`)).toEqual({
      ok: true,
      value: { digits: UTR, nipCode: '', stampedMs: null },
    })
    expect(decodeSessionId('UPI ID 63251478901')).toMatchObject({
      ok: false,
      reason: 'length',
    })
  })

  it('reads a common UPI credit alert', () => {
    const r = parseAlert(
      {
        id: 'a1',
        from: 'alerts@hdfc.bank.example',
        body: 'Dear Customer, Rs.1,850.00 has been credited to your account XX4521 by VPA rahul.mehta@okicici (RAHUL MEHTA) on 21-11-2026 15:43. UPI Ref No 632514789012.',
        receivedAt: at(15, 44).ms,
        inSpam: false,
      },
      config(),
    )
    expect(r).toMatchObject({
      status: 'parsed',
      credit: {
        bank: 'hdfc',
        direction: 'credit',
        amountKobo: 185_000,
        sender: 'RAHUL MEHTA',
        sessionId: UTR,
      },
    })
  })

  it('matches a receipt to the credit with the same UPI reference', () => {
    const v = verifyReceipt(
      receipt({ reference: UTR, sender: 'Rahul M' }),
      ledger([credit({ sessionId: UTR, sender: 'RAHUL MEHTA', bank: 'hdfc' })]),
      config(),
    )
    expect(v).toMatchObject({ kind: 'matched', creditId: 'c1' })
  })

  it('refuses a UPI reference already used for another order', () => {
    const v = verifyReceipt(
      receipt({ reference: UTR }),
      ledger([credit({ sessionId: UTR })], {
        usedSessionIds: new Map([[UTR, '12']]),
      }),
      config(),
    )
    expect(v).toEqual({
      kind: 'mismatch',
      reason: "This receipt's UPI reference was already used for order 12.",
    })
  })
})

describe('Pix (São Paulo)', () => {
  beforeEach(() => setMarket('br'))
  const config = () => verifyFor(DEFAULT_VERIFY)
  // Nubank's ISPB, 21 Nov 2026 18:42 UTC (15:42 in São Paulo).
  const E2E = 'E18236120202611211842a1B2c3D4e5F'

  it('reads the sending bank and the time inside a Pix ID', () => {
    const r = decodeSessionId(`ID da transação: ${E2E}`)
    expect(r.ok && r.value.nipCode).toBe('18236120')
    expect(r.ok && new Date(r.value.stampedMs!).toISOString()).toBe(
      '2026-11-21T15:42:00.000Z',
    )
  })

  it('reads a common Pix credit alert, with a decimal comma', () => {
    const r = parseAlert(
      {
        id: 'a2',
        from: 'alerts@itau.bank.example',
        body: `Você recebeu um Pix de R$ 1.850,00 de MARIANA SOUZA em 21/11/2026 às 15:42. ID da transação: ${E2E}`,
        receivedAt: at(15, 43).ms,
        inSpam: false,
      },
      config(),
    )
    expect(r).toMatchObject({
      status: 'parsed',
      credit: {
        bank: 'itau',
        amountKobo: 185_000,
        sender: 'MARIANA SOUZA',
        sessionId: E2E,
      },
    })
  })

  it('matches by Pix ID', () => {
    const v = verifyReceipt(
      receipt({ reference: E2E, senderBank: 'nubank' }),
      ledger([credit({ sessionId: E2E, bank: 'itau' })]),
      config(),
    )
    expect(v).toMatchObject({ kind: 'matched' })
  })

  it('catches a Pix ID from a different bank than the receipt shows', () => {
    const v = verifyReceipt(
      receipt({ reference: E2E, senderBank: 'bradesco' }),
      ledger([credit({ sessionId: E2E })]),
      config(),
    )
    expect(v).toEqual({
      kind: 'mismatch',
      reason:
        'The Pix ID was issued by Nubank, but the receipt is from Bradesco.',
    })
  })

  it('catches a receipt whose time disagrees with its Pix ID', () => {
    const v = verifyReceipt(
      receipt({ reference: E2E, senderBank: 'nubank', at: at(11, 5) }),
      ledger([credit({ sessionId: E2E })]),
      config(),
    )
    expect(v).toMatchObject({ kind: 'mismatch' })
  })

  it('treats an unreadable Pix ID as a question, not a mismatch', () => {
    const v = verifyReceipt(
      receipt({
        reference: 'E1823612020261121',
        senderBank: 'nubank',
        sender: 'MARIANA SOUZA',
      }),
      ledger([credit({ sender: 'MARIANA SOUZA', bank: 'itau' })]),
      config(),
    )
    expect(v.kind).toBe('check')
  })
})

describe('receipt status words in Portuguese', () => {
  it('reads a scheduled Pix as pending, and a refused one as failed', async () => {
    const { toReceipt } = await import('./receiptFields')
    const raw = (statusText: string) => ({
      issuer: 'Nubank',
      amountText: 'R$ 150,00',
      statusText,
      sender: 'MARIANA SOUZA',
      recipient: '',
      sessionId: '',
      reference: '',
      dateTime: '21/11/2026 15:42',
    })
    setMarket('br')
    const cfg = verifyFor(DEFAULT_VERIFY)
    expect(toReceipt(raw('Pix agendado'), cfg).status).toBe('pending')
    expect(toReceipt(raw('Transferência não concluída'), cfg).status).toBe(
      'failed',
    )
    expect(toReceipt(raw('Pix enviado'), cfg).status).toBe('successful')
    expect(toReceipt(raw('Pix enviado'), cfg).amountKobo).toBe(15_000)
  })
})
