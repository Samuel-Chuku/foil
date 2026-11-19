import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY } from '../config/defaults'
import { parseAlert, type AlertEmail } from './alerts'
import type { VerifyConfig } from './types'

// Synthetic alerts in each bank's layout. Names, numbers and addresses are invented.
const config: VerifyConfig = {
  ...DEFAULT_VERIFY,
  banks: DEFAULT_VERIFY.banks.map((b) => ({
    ...b,
    alertSenders: [`alerts@${b.id}.sample.test`],
  })),
}

const received = Date.UTC(2026, 10, 21, 11, 2, 30)
const email = (
  bank: string,
  body: string,
  extra: Partial<AlertEmail> = {},
): AlertEmail => ({
  id: `${bank}-1`,
  from: `alerts@${bank}.sample.test`,
  body,
  receivedAt: received,
  inSpam: false,
  ...extra,
})

const parsed = (e: AlertEmail) => {
  const r = parseAlert(e, config)
  if (r.status !== 'parsed') throw new Error(`expected parsed, got ${r.status}`)
  return r.credit
}

describe('parseAlert', () => {
  it('reads a GTBank credit and its session ID', () => {
    const c = parsed(
      email(
        'gtbank',
        `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    100004261121100212000000000123-ADAEZE OKAFOR SHOES
Amount    :    NGN 18500
Value Date    :    2026-11-21
Remarks    :    ADAEZE OKAFOR OPAY
Time of Transaction    :    11<:02:14>30 AM
Document Number    :    10000426112110021200`,
      ),
    )
    expect(c).toMatchObject({
      bank: 'gtbank',
      direction: 'credit',
      amountKobo: 1_850_000,
      sender: 'ADAEZE OKAFOR SHOES',
      sessionId: '100004261121100212000000000123',
      reversal: false,
      strength: 'alert received',
    })
    expect(c.at).toEqual({ ms: received, precision: 'second' })
  })

  it('reads an Access credit, taking the name before the slash', () => {
    const c = parsed(
      email(
        'access',
        `Your account has been Credited
NGN 12,000.00
Description    TUNDE BAKARE/for jeans
Reference Number    999NIPL26325000X
Transaction Date    21-Nov-2026`,
      ),
    )
    expect(c).toMatchObject({
      amountKobo: 1_200_000,
      sender: 'TUNDE BAKARE',
      reference: '999NIPL26325000X',
    })
  })

  it('reads a Kuda credit', () => {
    const c = parsed(
      email(
        'kuda',
        'Transaction Notification\n\nIfeoma Nwosu just sent you ₦7,500.00.\nLove,',
      ),
    )
    expect(c).toMatchObject({
      direction: 'credit',
      amountKobo: 750_000,
      sender: 'Ifeoma Nwosu',
    })
  })

  it('reads a Providus credit with its written time', () => {
    const c = parsed(
      email(
        'providus',
        `This is to notify you that a Credit transaction just occured on your account.
Amount    NGN 5,000.00
Narrative    INWARD TRANSFER(H) FROM PALMPAY/ BISI ADEYEMI-BISI ADEYEMI8000000000/100033261121100512000000000456
Time    Sat, Nov 21, 2026 at 11:05 AM
Reference    211120260000000001`,
      ),
    )
    expect(c).toMatchObject({
      sender: 'BISI ADEYEMI',
      sessionId: '100033261121100512000000000456',
    })
    expect(c.at?.precision).toBe('minute')
  })

  it('marks reversals', () => {
    const c = parsed(
      email(
        'gtbank',
        `a DEBIT transaction occurred
Description    :    REVERSAL ADAEZE OKAFOR
Amount    :    NGN 18500`,
      ),
    )
    expect(c).toMatchObject({ direction: 'debit', reversal: true })
  })

  it('refuses unknown senders, even with a perfect bank layout', () => {
    const r = parseAlert(
      email('kuda', 'Ifeoma Nwosu just sent you ₦7,500.00.', {
        from: 'kuda-alerts@mail.sample.test',
      }),
      config,
    )
    expect(r.status).toBe('untrusted')
  })

  it('refuses anything in spam', () => {
    const r = parseAlert(
      email('kuda', 'Ifeoma Nwosu just sent you ₦7,500.00.', { inSpam: true }),
      config,
    )
    expect(r.status).toBe('untrusted')
  })

  it('hands an unfamiliar layout from a trusted bank to the model', () => {
    expect(parseAlert(email('zenith', 'Something new'), config)).toEqual({
      status: 'unknown-format',
      bank: 'zenith',
    })
  })
})
