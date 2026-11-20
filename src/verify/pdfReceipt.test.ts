import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { parsePdfReceiptText } from './pdfReceipt'
import { toReceipt } from './receiptFields'

// Synthetic PDF text in the two layouts seen: "Label: value" on one line, and
// a label with its value on the next line.
const sameLine = `Transaction Receipt
Transaction Date:   Saturday November 21, 2026 00:00:00
Sender Name:   ADAEZE OKAFOR
Sender Account:   6500***001
Beneficiary Name:   SAMPLE STORES
Beneficiary Bank:   OPAY
Amount:   NGN 2,000.00
Session ID:   000023261121100212000000000123`

const nextLine = `Receipt
21 Nov 2026 11:02, GMT+1
₦   2,100.00
Two Thousand One Hundred Naira Zero Kobo
Success
Sender
Okafor, Adaeze
Beneficiary
Sample Stores
SessionID
000013261121110200000000000456`

describe('parsePdfReceiptText', () => {
  it('reads the same-line layout', () => {
    const r = toReceipt(parsePdfReceiptText(sameLine)!, config)
    expect(r).toMatchObject({
      amountKobo: 200_000,
      sender: 'ADAEZE OKAFOR',
      senderBank: 'providus',
    })
    expect(r.at?.precision).toBe('day')
  })

  it('reads the next-line layout', () => {
    const raw = parsePdfReceiptText(nextLine)!
    expect(raw).toMatchObject({
      sender: 'Okafor, Adaeze',
      recipient: 'Sample Stores',
      statusText: 'Success',
    })
    const r = toReceipt(raw, config)
    expect(r).toMatchObject({
      amountKobo: 210_000,
      senderBank: 'gtbank',
      status: 'successful',
    })
    expect(r.at?.precision).toBe('minute')
  })

  it('gives up on text it does not recognise', () => {
    expect(
      parsePdfReceiptText('Account statement\nOpening balance 0.00'),
    ).toBeNull()
  })
})
