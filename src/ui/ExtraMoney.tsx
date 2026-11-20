import type { ReactNode } from 'react'
import type { ExtraRow } from '../ledger/settle'
import type { Settlement } from '../ledger/types'
import { formatNaira } from '../verify/money'
import type { Credit } from '../verify/types'

// Times are Lagos wall-clock readings stored as UTC, so the UTC clock face is
// the Lagos time.
function clock(credit: Credit): string {
  return credit.at ? new Date(credit.at.ms).toISOString().slice(11, 16) : ''
}

function status(s: Settlement): string {
  switch (s.state) {
    case 'refund owed':
      return 'Refund owed'
    case 'refunded':
      return s.decidedBy === 'rules'
        ? 'Refunded (your transfer out was found in the alerts)'
        : 'Refunded'
    case 'kept':
      return 'Kept as credit for the next order'
  }
}

function describe(row: ExtraRow): string {
  const from = row.credit.sender || 'an unknown sender'
  const at = row.credit.at ? ` at ${clock(row.credit)}` : ''
  const what = row.orderCode
    ? `${formatNaira(row.amountKobo)} paid over the total of order ${row.orderCode}, from ${from}${at}`
    : `${formatNaira(row.amountKobo)} from ${from}${at}`
  if (row.settlement) return `${what} · ${status(row.settlement)}`
  if (row.orderCode) return what
  return row.settleable
    ? `${what} · a second payment from someone whose order is paid`
    : `${what} · no order matched yet`
}

// Money that arrived but pays for no order, with the vendor's choices. The
// desk only records the decision; any refund is sent from the bank app.
export function ExtraMoney(props: {
  rows: ExtraRow[]
  onSettle: (row: ExtraRow, state: Settlement['state']) => void
  onUndo: (key: string) => void
  // Extra controls under a row, such as the refund account in a chat.
  more?: (row: ExtraRow) => ReactNode
}) {
  return (
    <ul className="extra">
      {props.rows.map((row) => (
        <li key={row.key}>
          <p>{describe(row)}</p>
          {!row.settlement && row.settleable && (
            <p>
              <button
                type="button"
                onClick={() => props.onSettle(row, 'refund owed')}
              >
                Refund owed
              </button>{' '}
              <button
                type="button"
                className="quiet"
                onClick={() => props.onSettle(row, 'kept')}
              >
                Keep as credit
              </button>
            </p>
          )}
          {row.settlement?.refundTo && (
            <p>
              Send to {row.settlement.refundTo.accountNumber || '(no number)'} ·{' '}
              {row.settlement.refundTo.bank || '(no bank)'} ·{' '}
              {row.settlement.refundTo.accountName || '(no name)'}
            </p>
          )}
          {props.more?.(row)}
          {row.settlement && (
            <p>
              {row.settlement.state === 'refund owed' && (
                <>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => props.onSettle(row, 'refunded')}
                  >
                    Mark refunded
                  </button>{' '}
                </>
              )}
              <button
                type="button"
                className="link"
                onClick={() => props.onUndo(row.key)}
              >
                Undo
              </button>
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
