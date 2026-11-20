import type { RefundTo } from '../ledger/types'
import { bankFromText } from '../verify/banks'
import { clean } from '../verify/receiptFields'
import type { VerifyConfig } from '../verify/types'

// What the model copies from the chat, as written.
export type RawRefundTo = RefundTo

export const RAW_REFUND_FIELDS: readonly (keyof RawRefundTo)[] = [
  'accountNumber',
  'bank',
  'accountName',
]

// Nigerian account numbers (NUBAN) are ten digits. Anything else is left
// blank for the vendor to fill in, rather than guessed.
export function toRefundTo(raw: RawRefundTo, config: VerifyConfig): RefundTo {
  const digits = clean(raw.accountNumber).replace(/[\s-]/g, '')
  const bankText = clean(raw.bank)
  return {
    accountNumber: /^\d{10}$/.test(digits) ? digits : '',
    bank: bankFromText(config.banks, bankText)?.name ?? bankText,
    accountName: clean(raw.accountName),
  }
}
