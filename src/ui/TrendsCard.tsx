import { useState, type ReactNode } from 'react'
import { whenApproved, type RunJob } from '../ai/job'
import { planReport } from '../ai/report'
import type { Reading } from '../ai/run'
import { cloudErrorText } from '../cloud/send'
import { CHART_IDS, chartSpec, type ChartId } from '../ledger/charts'
import type { Report } from '../ledger/report'
import { trends, trendsText } from '../ledger/trends'
import type { Order } from '../ledger/types'
import { formatMoney } from '../verify/money'
import { Chart } from './Chart'
import { loadingLine, type LedgerApi } from './useLedger'
import { Icon } from './icons'

export type Lagos = { day: (o: Order) => string; hour: (o: Order) => number }

type Review =
  | { status: 'running' }
  | { status: 'done'; value: Reading<Report>; numbers: string }
  | { status: 'error'; message: string }

const SPANS = [7, 14, 30]

// The business over recent days: charts drawn on this computer from its own
// records, and, on request, a written review from the cloud that is sent
// only the totals behind those charts.
export function TrendsCard(props: {
  ledger: LedgerApi
  today: string
  lagos: Lagos
  jobs: RunJob
  badge: (r: Reading<unknown>) => ReactNode
}) {
  const { data, config } = props.ledger
  const [span, setSpan] = useState(7)
  const [review, setReview] = useState<Review | null>(null)
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Bank not known'
  const t = data ? trends(props.today, span, data, config, props.lagos) : null
  const numbers = t ? trendsText(t, bankName) : ''
  const spec = (id: ChartId) => (t ? chartSpec(t, id, bankName) : null)

  async function runReview() {
    if (!t) return
    try {
      const value = await props.jobs(
        whenApproved(planReport(numbers, span), () =>
          setReview({ status: 'running' }),
        ),
      )
      if (value) setReview({ status: 'done', value, numbers })
    } catch (e) {
      setReview({
        status: 'error',
        message: cloudErrorText(e),
      })
    }
  }

  const quiet = t !== null && t.current.orders === 0 && t.moneyInKobo === 0
  return (
    <details className="card shop-rules trends" data-tone="money">
      <summary>
        <h3>
          <Icon name="chart" />
          Your business over time
        </h3>
        <span className="hint">
          {!t
            ? loadingLine(props.ledger)
            : quiet
              ? `No orders in the last ${span} days yet.`
              : `Last ${span} days: ${t.current.orders} orders · ${formatMoney(t.current.paidKobo)} paid`}
        </span>
      </summary>
      <div className="span-pick" role="group" aria-label="Period">
        {SPANS.map((n) => (
          <button
            key={n}
            type="button"
            className="quiet"
            aria-pressed={span === n}
            onClick={() => {
              setSpan(n)
              setReview(null)
            }}
          >
            {n} days
          </button>
        ))}
      </div>
      <p className="hint">
        Drawn on this computer from your own records. Nothing here leaves it
        unless you ask for a review.
      </p>

      <section aria-labelledby="review-h" className="review">
        <h4 id="review-h">Review these {span} days</h4>
        {review?.status !== 'done' && (
          <p className="hint">
            Google&apos;s Gemini service reads the totals behind these charts
            and writes what stands out and what to do next. You see everything
            before it is sent.
          </p>
        )}
        {review?.status === 'running' && (
          <p aria-live="polite">Writing the review…</p>
        )}
        {review?.status === 'error' && (
          <p className="error" role="alert">
            {review.message}
          </p>
        )}
        {review?.status === 'done' && (
          <ReviewResult
            report={review.value.fields}
            badge={props.badge(review.value)}
            stale={review.numbers !== numbers}
            spec={spec}
          />
        )}
        <button
          type="button"
          disabled={!t || quiet || review?.status === 'running'}
          onClick={() => void runReview()}
        >
          {review?.status === 'done' ? 'Write a new review' : 'Write a review'}
        </button>
      </section>

      {CHART_IDS.map((id) => {
        const s = spec(id)
        return s && <Chart key={id} spec={s} />
      })}
    </details>
  )
}

function ReviewResult(props: {
  report: Report
  badge: ReactNode
  stale: boolean
  spec: (id: ChartId) => ReturnType<typeof chartSpec> | null
}) {
  const { report } = props
  if (!report.headline && report.findings.length === 0) {
    return <p className="empty">The review came back empty. Try again.</p>
  }
  return (
    <div aria-live="polite">
      {props.badge}
      {props.stale && (
        <p className="hint">
          Your records have changed since this review was written.
        </p>
      )}
      {report.headline && <p className="headline">{report.headline}</p>}
      <ol className="findings">
        {report.findings.map((f, i) => {
          const s = f.chart ? props.spec(f.chart) : null
          return (
            <li key={i}>
              <p>{f.text}</p>
              {s && <Chart spec={s} />}
            </li>
          )
        })}
      </ol>
      {report.suggestions.length > 0 && (
        <>
          <h5>What to do next</h5>
          <ul className="suggestions">
            {report.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">
        Charts are drawn from your records; the cloud only chose which one goes
        with each point.
      </p>
    </div>
  )
}
