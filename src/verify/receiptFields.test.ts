import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { toReceipt, type RawReceipt } from './receiptFields'

// Synthetic receipt readings, shaped like the model's output.
const raw = (over: Partial<RawReceipt> = {}): RawReceipt => ({
  issuer: 'OPay',
  amountText: '₦18,500.00',
  statusText: 'Successful',
  sender: 'ADAEZE OKAFOR',
  recipient: 'SAMPLE STORES',
  sessionId: '100004261121100212000000000123',
  reference: '261121020100000000000001',
  dateTime: 'Nov 21st, 2026 11:02:14',
  ...over,
})

describe('toReceipt', () => {
  it('normalises amount, bank, time and status', () => {
    const r = toReceipt(raw(), config)
    expect(r).toMatchObject({
      amountKobo: 1_850_000,
      sender: 'ADAEZE OKAFOR',
      senderBank: 'opay',
      status: 'successful',
    })
    expect(r.at?.precision).toBe('second')
    expect(r.reference.startsWith('100004261121100212000000000123')).toBe(true)
  })

  it('reads a bank name split by the model', () => {
    expect(toReceipt(raw({ issuer: 'KUD A' }), config).senderBank).toBe('kuda')
  })

  it('reads a long bank name', () => {
    expect(
      toReceipt(raw({ issuer: 'United Bank for Africa' }), config).senderBank,
    ).toBe('uba')
  })

  it("falls back to the session ID's bank code when no header is read", () => {
    const r = toReceipt(
      raw({ issuer: 'N/A', sessionId: '000023261121100212000000000123' }),
      config,
    )
    expect(r.senderBank).toBe('providus')
  })

  it('treats placeholder answers as empty', () => {
    const r = toReceipt(raw({ sender: 'N/A', reference: 'none' }), config)
    expect(r.sender).toBe('')
    expect(r.reference).toBe('100004261121100212000000000123')
  })

  it('treats a printed midnight time as date only', () => {
    const r = toReceipt(
      raw({ dateTime: 'Saturday November 21, 2026 00:00:00' }),
      config,
    )
    expect(r.at?.precision).toBe('day')
  })

  it.each([
    ['Pending', 'pending'],
    ['Processing', 'pending'],
    ['Transaction Failed', 'failed'],
    ['Reversed', 'failed'],
    ['Transfer Request Successful', 'successful'],
    ['', 'unknown'],
  ] as const)('reads status %s', (statusText, want) => {
    expect(toReceipt(raw({ statusText }), config).status).toBe(want)
  })

  it('keeps an unreadable amount as null rather than guessing', () => {
    expect(
      toReceipt(raw({ amountText: 'see attached' }), config).amountKobo,
    ).toBeNull()
  })
})
