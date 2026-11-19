// Times are Lagos wall-clock readings stored as Date.UTC milliseconds. Lagos has
// no daylight saving, so a reading converts to true time by a fixed hour, and
// receipts, alerts and session IDs can be compared without timezone parsing.
export type LagosMs = number

export type Precision = 'second' | 'minute' | 'day'

export type Stamp = { ms: LagosMs; precision: Precision }

export type BankInfo = {
  id: string
  name: string
  // Six-digit NIP institution code that starts every session ID this bank sends.
  nipCode: string
  // Lowercase fragments that identify the bank in receipt or alert text.
  aliases: string[]
  // Exact sender addresses of this bank's alert emails. Anything else is untrusted.
  alertSenders: string[]
}

export type VerifyConfig = {
  banks: BankInfo[]
  // Share of the receipt name's words that must appear in the alert, 0 to 1.
  nameThreshold: number
  // How long after a receipt's time an interbank credit may still arrive.
  interbankWindowMin: number
  // Same-bank transfers land almost at once, so the window is much tighter.
  sameBankWindowMin: number
  // Receipts show minutes and clocks drift, so times may differ by this much.
  clockToleranceMin: number
  // Banks stamp session IDs in WAT or one hour behind it; both are accepted.
  sessionOffsetsMin: number[]
}

export type Credit = {
  id: string
  // The vendor's bank that received or sent the money.
  bank: string | null
  direction: 'credit' | 'debit'
  reversal: boolean
  amountKobo: number
  sender: string
  narration: string
  sessionId: string | null
  reference: string | null
  at: Stamp | null
  source: 'alert' | 'history' | 'manual'
  // An email alert is weaker evidence than a screenshot the vendor took.
  strength: 'alert received' | 'bank app'
}

export type Receipt = {
  amountKobo: number | null
  sender: string
  senderBank: string | null
  reference: string
  at: Stamp | null
  status: 'successful' | 'pending' | 'failed' | 'unknown'
}
