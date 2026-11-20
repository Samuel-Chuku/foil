import type { BankInfo, VerifyConfig } from '../verify/types'

// In-code defaults. Remote Config overrides them (see remote.ts), and they
// stay in force whenever it is unreachable or sends something invalid.
export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite'

// Common Nigerian Pidgin in orders, for the voice-note vocabulary.
export const DEFAULT_PIDGIN_GLOSSARY: Record<string, string> = {
  abeg: 'please',
  dey: 'is, are, or is available',
  wey: 'that, which',
  'don pay': 'have paid',
  'e don land': 'it has arrived',
  collect: 'buy, take',
  oya: 'okay, go ahead',
  wetin: 'what',
  'how much': 'what is the price',
  'sharp sharp': 'quickly',
  'send am come': 'deliver it to me',
  'no wahala': 'no problem',
  'i go': 'I will',
  na: 'it is',
  una: 'you (plural)',
}

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
      0,
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
    bank(
      'moniepoint',
      'Moniepoint',
      '090405',
      ['moniepoint'],
      ['no-reply@moniepoint.com'],
      true,
      0,
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
