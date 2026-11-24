import { useState } from 'react'
import type { ChartSpec } from '../ledger/charts'
import { moneyPulse, type Side } from '../ledger/pulse'
import { formatMoney } from '../verify/money'
import { Chart } from './Chart'
import { MoneyStatement } from './MoneyStatement'
import { loadingLine, type LedgerApi } from './useLedger'
import { Icon } from './icons'

const SPANS = [7, 14, 30] as const
type Span = (typeof SPANS)[number]

// Credit times are wall-clock times stored as UTC fields.
const time = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const weekday = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

function changeText(s: Side, lastWeekDay: string): string {
  if (s.change === null) {
    return s.kobo > 0
      ? `Nothing by this time last ${lastWeekDay}`
      : `Nothing yet, as last ${lastWeekDay}`
  }
  const pct = Math.round(Math.abs(s.change) * 100)
  if (pct === 0) return `Level with last ${lastWeekDay} by this time`
  return `${s.change > 0 ? '▲' : '▼'} ${pct}% ${s.change > 0 ? 'more' : 'less'} than last ${lastWeekDay} by this time`
}

export function MoneyPulseCard(props: { ledger: LedgerApi; now: number }) {
  const { data, config } = props.ledger
  const [span, setSpan] = useState<Span>(7)
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Bank not known'

  // Alerts already on screen when the card opened are not highlighted; ones
  // that arrive while it is open are, briefly.
  const [seen, setSeen] = useState<Set<string> | null>(null)
  if (data && seen === null) {
    setSeen(new Set(data.credits.map((c) => c.id)))
  }

  if (!data) {
    return (
      <section
        className="card pulse"
        data-tone="money"
        aria-labelledby="pulse-h"
      >
        <h3 id="pulse-h">
          <Icon name="pulse" />
          Money today
        </h3>
        <p className="empty">
          {loadingLine(props.ledger, 'Loading your bank alerts…')}
        </p>
      </section>
    )
  }

  const pulse = moneyPulse(
    data.credits,
    data.orders,
    data.settlements,
    props.now,
    span,
  )
  const newest = pulse.latest[0]
  const lastWeekDay = weekday(props.now - 7 * 86_400_000)
  const nothing = data.credits.length === 0

  const spec: ChartSpec = {
    id: 'money-in-out',
    title: `Money in and out, last ${span} days`,
    kind: 'lines',
    unit: 'naira',
    series: ['Money in', 'Money out'],
    points: pulse.days.map((d) => ({
      label: shortDay(d.day),
      values: [d.inKobo, d.outKobo],
    })),
    summary: `Confirmed by your bank alerts: ${formatMoney(
      pulse.days.reduce((t, d) => t + d.inKobo, 0),
    )} in and ${formatMoney(
      pulse.days.reduce((t, d) => t + d.outKobo, 0),
    )} out over ${span} days.`,
  }

  return (
    <section className="card pulse" data-tone="money" aria-labelledby="pulse-h">
      <div className="pulse-head">
        <h3 id="pulse-h">
          <Icon name="pulse" />
          Money today
        </h3>
        <p className="pulse-live" role="status">
          <span className="pulse-dot" aria-hidden="true" />
          {pulse.newestMs === null
            ? 'Live: waiting for the first alert'
            : `Live: latest alert at ${time(pulse.newestMs)}`}
        </p>
      </div>

      {nothing ? (
        <p className="empty">
          No bank alerts read yet. Money in and out appears here as each alert
          arrives, confirmed by your bank, not by a customer&rsquo;s receipt.
        </p>
      ) : (
        <>
          <div className="pulse-tiles">
            {(
              [
                ['in', 'Money in', pulse.today.in],
                ['out', 'Money out', pulse.today.out],
              ] as const
            ).map(([dir, label, s]) => (
              <div
                key={dir}
                className="pulse-tile"
                data-dir={dir}
                data-landed={dir === 'in' && s.kobo > 0 ? '' : undefined}
              >
                <span className="pulse-label">
                  <span aria-hidden="true">{dir === 'in' ? '↓' : '↑'}</span>{' '}
                  {label}
                </span>
                <strong>{formatMoney(s.kobo)}</strong>
                <span className="hint">{changeText(s, lastWeekDay)}</span>
              </div>
            ))}
          </div>

          <div
            className="pulse-spans"
            role="group"
            aria-label="Days shown in the chart"
          >
            {SPANS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={span === n}
                onClick={() => setSpan(n)}
              >
                {n} days
              </button>
            ))}
          </div>
          <Chart spec={spec} />

          <details className="money-flow pulse-latest">
            <summary>
              Latest alerts
              {newest && (
                <span className="hint">
                  {' '}
                  · {newest.credit.direction === 'credit' ? '+' : '−'}
                  {formatMoney(newest.credit.amountKobo)} at{' '}
                  {time(newest.credit.at!.ms)}
                </span>
              )}
            </summary>
            <ul className="pulse-feed">
              {pulse.latest.map(({ credit: c, orderCode, refund }) => (
                <li
                  key={c.id}
                  data-dir={c.direction}
                  data-reversal={c.reversal ? '' : undefined}
                  className={!seen || seen.has(c.id) ? undefined : 'fresh'}
                >
                  <span className="pulse-time">{time(c.at!.ms)}</span>
                  <span className="pulse-tag">
                    {c.reversal
                      ? 'Reversal'
                      : c.direction === 'credit'
                        ? 'In'
                        : 'Out'}
                  </span>
                  <span className="pulse-amount">
                    {c.direction === 'credit' ? '+' : '−'}
                    {formatMoney(c.amountKobo)}
                  </span>
                  <span className="pulse-what">
                    {bankName(c.bank)}
                    {orderCode
                      ? ` · order #${orderCode}`
                      : refund
                        ? ' · refund'
                        : c.direction === 'credit' && !c.reversal
                          ? ' · not tied to an order'
                          : ''}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <MoneyStatement ledger={props.ledger} />
          <p className="hint">
            Counted only from your banks&rsquo; own alerts and your bank-app
            screenshots, never from a customer&rsquo;s receipt. Reversals are
            listed but not counted. It all stays on this computer.
          </p>
        </>
      )}
    </section>
  )
}
