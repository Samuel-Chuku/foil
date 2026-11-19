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
): BankInfo => ({ id, name, nipCode, aliases, alertSenders: [] })

export const DEFAULT_VERIFY: VerifyConfig = {
  banks: [
    bank('gtbank', 'GTBank', '000013', ['gtco', 'gtbank', 'guaranty trust']),
    bank('access', 'Access Bank', '000014', ['access']),
    bank('zenith', 'Zenith Bank', '000015', ['zenith']),
    bank('uba', 'UBA', '000004', ['united bank for africa', 'uba']),
    bank('providus', 'Providus Bank', '000023', ['providus']),
    bank('kuda', 'Kuda', '090267', ['kuda']),
    bank('moniepoint', 'Moniepoint', '090405', ['moniepoint']),
    bank('opay', 'OPay', '100004', ['opay', 'paycom']),
    bank('palmpay', 'PalmPay', '100033', ['palmpay']),
    bank('nomba', 'Nomba', '090645', ['nomba']),
  ],
  nameThreshold: 0.6,
  interbankWindowMin: 60,
  sameBankWindowMin: 2,
  clockToleranceMin: 3,
  sessionOffsetsMin: [0, 60],
}
