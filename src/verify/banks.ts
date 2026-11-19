import type { BankInfo } from './types'

export function bankFromText(banks: BankInfo[], text: string): BankInfo | null {
  const t = text.toLowerCase()
  return banks.find((b) => b.aliases.some((a) => t.includes(a))) ?? null
}

export function bankFromNipCode(
  banks: BankInfo[],
  code: string,
): BankInfo | null {
  return banks.find((b) => b.nipCode === code) ?? null
}

export function bankFromSender(
  banks: BankInfo[],
  fromAddress: string,
): BankInfo | null {
  const addr = fromAddress.trim().toLowerCase()
  return banks.find((b) => b.alertSenders.includes(addr)) ?? null
}
