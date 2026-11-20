import type { Settlement } from '../ledger/types'
import { formatNaira } from '../verify/money'
import type { Credit } from '../verify/types'

export type ExtraRow = { credit: Credit; settlement: Settlement | null }

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

// Money that arrived but pays for no order, with the vendor's choices. The
// desk only records the decision; any refund is sent from the bank app.
export function ExtraMoney(props: {
  rows: ExtraRow[]
  // Credits whose payer already has a paid order, so they can be called extra.
  settleable: Set<string>
  onSettle: (creditId: string, state: Settlement['state']) => void
}) {
  return (
    <ul className="extra">
      {props.rows.map(({ credit, settlement }) => (
        <li key={credit.id}>
          <p>
            {formatNaira(credit.amountKobo)} from{' '}
            {credit.sender || 'an unknown sender'}
            {credit.at && ` at ${clock(credit)}`}
            {settlement
              ? ` · ${status(settlement)}`
              : props.settleable.has(credit.id)
                ? ' · a second payment from someone whose order is paid'
                : ' · no order matched yet'}
          </p>
          {!settlement && props.settleable.has(credit.id) && (
            <p>
              <button
                type="button"
                onClick={() => props.onSettle(credit.id, 'refund owed')}
              >
                Refund owed
              </button>{' '}
              <button
                type="button"
                className="quiet"
                onClick={() => props.onSettle(credit.id, 'kept')}
              >
                Keep as credit
              </button>
            </p>
          )}
          {settlement?.state === 'refund owed' && (
            <p>
              <button
                type="button"
                className="quiet"
                onClick={() => props.onSettle(credit.id, 'refunded')}
              >
                Mark refunded
              </button>
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
