import { useState } from 'react'
import { bookDays, dayBooks, type Tally } from '../ledger/dayBooks'
import { formatMoney } from '../verify/money'
import type { Lagos } from './TrendsCard'
import { loadingLine, type LedgerApi } from './useLedger'
import { Icon } from './icons'

const tally = (t: Tally) =>
  t.count ? `${t.count} · ${formatMoney(t.kobo)}` : 'None'

function dayTitle(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

// The day's books, worked out on this computer. Questions about them go to
// Ask the desk, at the foot of the panel.
export function BooksCard(props: {
  ledger: LedgerApi
  today: string
  lagos: Lagos
}) {
  const { data, config } = props.ledger
  const days = data ? bookDays(data.orders, data.credits, props.lagos.day) : []
  const [picked, setPicked] = useState<string | null>(null)
  const day = picked ?? props.today
  const books = data ? dayBooks(day, data, config, props.lagos.day) : null
  const empty = books && books.orders === 0 && books.moneyInKobo === 0
  return (
    <details className="card shop-rules books" data-tone="money">
      <summary>
        <h3>
          <Icon name="book" />
          Books for the day
        </h3>
        <span className="hint">
          {!books
            ? loadingLine(props.ledger)
            : empty
              ? 'No orders or bank money yet.'
              : `${books.orders} order${books.orders === 1 ? '' : 's'} · ${formatMoney(books.paid.kobo)} paid · ${books.waiting.count + books.toCheck.count + books.short.count} open`}
        </span>
      </summary>
      {days.length > 1 && (
        <label>
          Day{' '}
          <select
            value={day}
            onChange={(e) => {
              setPicked(e.target.value)
            }}
          >
            {[...new Set([props.today, ...days])].map((d) => (
              <option key={d} value={d}>
                {dayTitle(d)}
              </option>
            ))}
          </select>
        </label>
      )}
      {books && (
        <dl className="fields">
          <dt>Orders</dt>
          <dd>
            {books.orders}, worth {formatMoney(books.orderedKobo)}
            {books.unpriced > 0 && ` (${books.unpriced} without a price)`}
          </dd>
          <dt>Fully paid</dt>
          <dd>{tally(books.paid)}</dd>
          <dt>Paid in part</dt>
          <dd>
            {books.short.count
              ? `${books.short.count} · ${formatMoney(books.short.kobo)} still owed`
              : 'None'}
          </dd>
          <dt>Waiting for payment</dt>
          <dd>{tally(books.waiting)}</dd>
          <dt>Receipts to check</dt>
          <dd>{tally(books.toCheck)}</dd>
          <dt>Bank money</dt>
          <dd>
            In {formatMoney(books.moneyInKobo)} · Out{' '}
            {formatMoney(books.moneyOutKobo)}
          </dd>
          <dt>Pays no order</dt>
          <dd>{tally(books.notTied)}</dd>
          <dt>Refunds</dt>
          <dd>
            {books.refundsOwed.count + books.refundsSent.count
              ? `${formatMoney(books.refundsOwed.kobo)} owed · ${formatMoney(books.refundsSent.kobo)} sent`
              : 'None'}
          </dd>
          <dt>Deliveries</dt>
          <dd>
            {books.delivery.toSend} to send · {books.delivery.out} out ·{' '}
            {books.delivery.done} done
          </dd>
          {books.open.length > 0 && (
            <>
              <dt>Open orders</dt>
              <dd>
                <ul className="open-orders">
                  {books.open.map((o) => (
                    <li key={o.code}>
                      Order {o.code}
                      {o.dueKobo !== null &&
                        `, ${formatMoney(o.dueKobo)}`}: {o.status}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          {books.items.length > 0 && (
            <>
              <dt>Sold</dt>
              <dd>
                {books.items
                  .slice(0, 5)
                  .map((i) => `${i.qty} x ${i.name}`)
                  .join(', ')}
                {books.items.length > 5 && ', and more'}
              </dd>
            </>
          )}
        </dl>
      )}

      <p className="hint">
        Questions about these books, or anything else in the shop, go to Ask the
        desk at the foot of the panel.
      </p>
    </details>
  )
}
