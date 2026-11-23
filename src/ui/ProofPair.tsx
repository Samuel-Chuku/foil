import type { MoneyState } from './moneyState'
import { formatMoney } from '../verify/money'
import type { Credit, Receipt } from '../verify/types'

const PILL: Record<MoneyState, string> = {
  waiting: '· Waiting',
  claimed: '○ Not yet credited',
  landed: '✓ Landed',
  check: '? Check this',
  mismatch: '× Does not match',
}

export function StatePill(props: { state: MoneyState }) {
  return (
    <span className="state-pill" data-state={props.state}>
      {PILL[props.state]}
    </span>
  )
}

// Stamps are wall-clock times kept as UTC fields.
const time = (r: { at: { ms: number; precision: string } | null }) =>
  r.at && r.at.precision !== 'day'
    ? new Date(r.at.ms).toISOString().slice(11, 16)
    : null

// What the receipt claims beside what the bank confirms: the desk's whole
// question, "did the money land?", in one component.
export function ProofPair(props: {
  state: MoneyState
  receipt: Receipt | null
  credit: Credit | null
  bankName: (id: string | null) => string
}) {
  const { state, receipt, credit } = props
  const receiptLine = receipt
    ? [receipt.sender || 'Sender not read', time(receipt)]
        .filter(Boolean)
        .join(' · ')
    : ''
  const bank =
    credit && state === 'landed'
      ? {
          amount: formatMoney(credit.amountKobo),
          line: [props.bankName(credit.bank), time(credit)]
            .filter(Boolean)
            .join(' · '),
        }
      : {
          amount: null,
          line: {
            waiting: 'Waiting for a receipt',
            claimed: 'No matching credit in your alerts',
            landed: 'Confirmed by your bank',
            check: 'More than one credit could fit',
            mismatch: 'Your alerts disagree with the receipt',
          }[state],
        }
  const none = {
    waiting: 'No receipt yet',
    claimed: 'Nothing yet',
    landed: 'Landed',
    check: 'Not sure',
    mismatch: 'Not this',
  }[state]

  return (
    <div className="proof" role="group" aria-label="Receipt and bank compared">
      <div className="proof-half" data-side="receipt">
        <span className="label">The receipt says</span>
        <span className="proof-amount">
          {receipt?.amountKobo != null
            ? formatMoney(receipt.amountKobo)
            : 'Not read'}
        </span>
        {receiptLine && <span className="proof-detail">{receiptLine}</span>}
      </div>
      <div className="proof-half" data-side="bank" data-state={state}>
        <span className="label">Your bank says</span>
        <span
          className="proof-amount"
          data-none={bank.amount === null ? '' : undefined}
        >
          {bank.amount ?? none}
        </span>
        <span className="proof-detail">{bank.line}</span>
      </div>
    </div>
  )
}
