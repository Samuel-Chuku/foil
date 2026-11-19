import type { BankInfo, VerifyConfig } from '../verify/types'

// In-code defaults. Remote Config overrides these once it is wired up.
export const DEFAULTS = {
  cloudModel: 'gemini-3.5-flash-lite',
} as const

const bank = (
  id: string,
  name: string,
  nipCode: string,
  aliases: string[],
  alertSenders: string[],
  receiptShowsSessionId: boolean,
  sessionOffsetMin: number | null,
): BankInfo => ({
  id,
  name,
  nipCode,
  aliases,
  alertSenders,
  receiptShowsSessionId,
  sessionOffsetMin,
})

// Codes, sender addresses and offsets were checked against real receipts and
// alerts, except where marked unconfirmed.
export const DEFAULT_VERIFY: VerifyConfig = {
  banks: [
    bank(
      'gtbank',
      'GTBank',
      '000013',
      ['gtco', 'gtbank', 'guaranty trust'],
      ['gens@gtbank.com'],
      true,
      0,
    ),
    bank(
      'access',
      'Access Bank',
      '000014',
      ['access'],
      ['no_reply@accessbankplc.com'],
      true,
      null,
    ),
    // Zenith's code is unconfirmed: its receipts print no session ID.
    bank(
      'zenith',
      'Zenith Bank',
      '000015',
      ['zenith'],
      ['ebusinessgroup@zenithbank.com'],
      false,
      null,
    ),
    bank(
      'uba',
      'UBA',
      '000004',
      ['united bank for africa', 'uba'],
      ['uba.alert@ubagroup.com'],
      true,
      0,
    ),
    bank(
      'providus',
      'Providus Bank',
      '000023',
      ['providus'],
      ['alert@providusunitybank.com'],
      true,
      0,
    ),
    bank('kuda', 'Kuda', '090267', ['kuda'], ['no-reply@kuda.com'], true, 60),
    // Moniepoint's receipt ID does not follow the 30-digit NIP layout; unconfirmed.
    bank(
      'moniepoint',
      'Moniepoint',
      '090405',
      ['moniepoint'],
      ['no-reply@moniepoint.com'],
      false,
      null,
    ),
    bank(
      'opay',
      'OPay',
      '100004',
      ['opay', 'paycom'],
      ['no-reply@opay-nigeria.com'],
      true,
      60,
    ),
    bank(
      'palmpay',
      'PalmPay',
      '100033',
      ['palmpay'],
      ['no-reply@palmpay.com'],
      false,
      60,
    ),
    bank('nomba', 'Nomba', '090645', ['nomba'], [], true, 60),
  ],
  nameThreshold: 0.6,
  interbankWindowMin: 60,
  sameBankWindowMin: 10,
  clockToleranceMin: 3,
  sessionOffsetsMin: [0, 60],
}
