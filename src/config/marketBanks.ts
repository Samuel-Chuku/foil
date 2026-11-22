import type { BankInfo, VerifyConfig } from '../verify/types'
import { market, type Market } from './market'

// Banks for the markets after Lagos. Pix ISPB codes are from Banco Central's
// participant list (as republished by iDinheiro, updated 20 Sep 2026).
// Alert sender addresses are not confirmed for these banks, so the demo uses
// fictional ".example" addresses; a real deployment confirms each bank's
// address first, as was done for the Nigerian banks.

const bank = (
  id: string,
  name: string,
  code: string,
  aliases: string[],
): BankInfo => ({
  id,
  name,
  nipCode: code,
  aliases,
  alertSenders: [`alerts@${id}.bank.example`],
  // UPI and Pix receipts always show their reference.
  receiptShowsSessionId: true,
  sessionOffsetMin: 0,
})

const INDIA: BankInfo[] = [
  bank('hdfc', 'HDFC Bank', '', ['hdfc']),
  bank('icici', 'ICICI Bank', '', ['icici']),
  bank('sbi', 'State Bank of India', '', ['state bank', 'sbi']),
  bank('kotak', 'Kotak Mahindra Bank', '', ['kotak']),
  bank('axis', 'Axis Bank', '', ['axis bank']),
]

const BRAZIL: BankInfo[] = [
  bank('nubank', 'Nubank', '18236120', ['nubank', 'nu pagamentos']),
  bank('itau', 'Itaú', '60701190', ['itaú', 'itau']),
  bank('bradesco', 'Bradesco', '60746948', ['bradesco']),
  bank('caixa', 'Caixa', '00360305', ['caixa']),
  bank('inter', 'Banco Inter', '00416968', ['banco inter', 'inter']),
  bank('bb', 'Banco do Brasil', '00000000', ['banco do brasil']),
  bank('picpay', 'PicPay', '22896431', ['picpay']),
  bank('mercadopago', 'Mercado Pago', '10573521', ['mercado pago']),
]

// The verify settings for a market: Lagos keeps Remote Config's banks and
// offsets; other markets bring their own banks and rail, and their
// references carry no bank-specific clock offset.
export function verifyFor(
  base: VerifyConfig,
  m: Market = market(),
): VerifyConfig {
  if (m.id === 'ng') return base
  return {
    ...base,
    rail: m.rail,
    banks: m.id === 'in' ? INDIA : BRAZIL,
    sessionOffsetsMin: [0],
  }
}
