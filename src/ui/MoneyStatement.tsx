import { moneyFlow } from '../ledger/flow'
import { formatMoney } from '../verify/money'
import type { LedgerApi } from './useLedger'

// Shop wall-clock times are stored as UTC fields.
const time = (ms: number) => new Date(ms).toISOString().slice(11, 16)

function dayTitle(day: string | null): string {
  if (!day) return 'Date not shown by the bank'
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

const sums = (inKobo: number, outKobo: number) =>
  `In ${formatMoney(inKobo)} · Out ${formatMoney(outKobo)}`

// The full statement: every alert, by day and then by bank. Shown inside the
// money dashboard, below its latest alerts.
export function MoneyStatement(props: { ledger: LedgerApi }) {
  const { data, config } = props.ledger
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Bank not known'
  const days = data
    ? moneyFlow(data.credits, data.orders, data.settlements)
    : []

  return (
    <details className="money-flow">
      <summary>Every alert, by day and bank</summary>
      {days.map((d) => (
        <section key={d.day ?? 'undated'} className="flow-day">
          <h4>
            {dayTitle(d.day)}
            <span>{sums(d.inKobo, d.outKobo)}</span>
          </h4>
          {d.banks.map((b) => (
            <div key={b.bank ?? 'unknown'} className="flow-bank">
              <h5>
                {bankName(b.bank)}
                <span>{sums(b.inKobo, b.outKobo)}</span>
              </h5>
              <ul>
                {b.rows.map(({ credit: c, orderCode, refund }) => (
                  <li key={c.id} data-dir={c.direction}>
                    <span>{c.at ? time(c.at.ms) : '--:--'}</span>
                    <span>
                      {c.direction === 'credit' ? '+' : '−'}
                      {formatMoney(c.amountKobo)}
                    </span>
                    <span>
                      {c.sender ||
                        (c.direction === 'credit' ? 'Money in' : 'Money out')}
                      {c.reversal && ' · reversal'}
                      {orderCode && ` · order ${orderCode}`}
                      {refund && ' · refund'}
                      {c.source === 'history' && ' · bank app'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </details>
  )
}
