import type { ChatSession } from 'firebase/ai'
import { useRef, useState, type ReactNode } from 'react'
import { askBooks, booksChat, booksRequest, followUpRequest } from '../ai/books'
import type { Reading } from '../ai/run'
import {
  approve,
  redact,
  type Approved,
  type CloudRequest,
} from '../cloud/approval'
import { cloudErrorText } from '../cloud/send'
import { chartSpec } from '../ledger/charts'
import { bookDays, booksText, dayBooks, type Tally } from '../ledger/dayBooks'
import type { Answer } from '../ledger/report'
import { trends, trendsText } from '../ledger/trends'
import { formatNaira } from '../verify/money'
import { Chart } from './Chart'
import type { Lagos } from './TrendsCard'
import type { LedgerApi } from './useLedger'

// The chat also sees this many days before the chosen one, so it can answer
// questions about the week or how things have changed.
const CHAT_SPAN = 14

type Turn = {
  question: string
  answer?: Reading<Answer>
  error?: string
}

const tally = (t: Tally) =>
  t.count ? `${t.count} · ${formatNaira(t.kobo)}` : 'None'

function dayTitle(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

// The day's books, worked out on this computer, and a chat about them in the
// cloud. The chat is sent totals, order numbers and the questions, never who
// paid.
export function BooksCard(props: {
  ledger: LedgerApi
  today: string
  lagos: Lagos
  online: boolean
  ask: (request: CloudRequest) => Promise<Approved | null>
  badge: (r: Reading<unknown>) => ReactNode
}) {
  const { data, config } = props.ledger
  const days = data ? bookDays(data.orders, data.credits, props.lagos.day) : []
  const [picked, setPicked] = useState<string | null>(null)
  const day = picked ?? props.today
  const books = data ? dayBooks(day, data, config, props.lagos.day) : null
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Bank not known'
  const recent = data ? trends(day, CHAT_SPAN, data, config, props.lagos) : null
  const bookLines = books ? booksText(books) : ''
  const trendLines = recent ? trendsText(recent, bankName) : ''
  // What the chat was given, to tell when the records have moved on.
  const totals = `${bookLines}\n${trendLines}`

  const chat = useRef<ChatSession | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)

  const startOver = () => {
    chat.current = null
    setSent(null)
    setTurns([])
  }

  async function send() {
    const typed = question.trim()
    if (!typed || !books || busy) return
    if (!props.online) {
      setTurns((t) => [
        ...t,
        { question: typed, error: 'You are offline. Nothing was sent.' },
      ])
      return
    }
    // A name or number typed into a question is swapped out like anywhere
    // else, and the vendor then sees the swapped question before it goes.
    const names = (data?.customers ?? []).map((c) => ({
      name: c.name,
      label: '(customer)',
    }))
    const { text, replaced } = redact(typed, names)
    const first = !chat.current
    const request = first
      ? booksRequest(bookLines, trendLines, text, replaced)
      : followUpRequest(text, replaced)
    // A follow-up the vendor typed and nothing was swapped in is already on
    // screen exactly as it will be sent, so their Ask click is the approval.
    const approved =
      first || replaced.length ? await props.ask(request) : approve(request)
    if (!approved) return
    chat.current ??= booksChat()
    if (first) setSent(totals)
    setQuestion('')
    setBusy(true)
    const at = turns.length
    setTurns((t) => [...t, { question: text }])
    try {
      const answer = await askBooks(chat.current, approved)
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, answer } : x)))
    } catch (e) {
      const error =
        e instanceof SyntaxError
          ? 'The answer came back in a form the desk could not read. Try again.'
          : cloudErrorText(e)
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, error } : x)))
    } finally {
      setBusy(false)
    }
  }

  const empty = books && books.orders === 0 && books.moneyInKobo === 0
  return (
    <details className="card shop-rules books">
      <summary>
        <h3>Books for the day</h3>
        <span className="hint">
          {!books
            ? 'Loading…'
            : empty
              ? 'No orders or bank money yet.'
              : `${books.orders} order${books.orders === 1 ? '' : 's'} · ${formatNaira(books.paid.kobo)} paid · ${books.waiting.count + books.toCheck.count + books.short.count} open`}
        </span>
      </summary>
      {days.length > 1 && (
        <label>
          Day{' '}
          <select
            value={day}
            onChange={(e) => {
              setPicked(e.target.value)
              startOver()
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
            {books.orders}, worth {formatNaira(books.orderedKobo)}
            {books.unpriced > 0 && ` (${books.unpriced} without a price)`}
          </dd>
          <dt>Fully paid</dt>
          <dd>{tally(books.paid)}</dd>
          <dt>Paid in part</dt>
          <dd>
            {books.short.count
              ? `${books.short.count} · ${formatNaira(books.short.kobo)} still owed`
              : 'None'}
          </dd>
          <dt>Waiting for payment</dt>
          <dd>{tally(books.waiting)}</dd>
          <dt>Receipts to check</dt>
          <dd>{tally(books.toCheck)}</dd>
          <dt>Bank money</dt>
          <dd>
            In {formatNaira(books.moneyInKobo)} · Out{' '}
            {formatNaira(books.moneyOutKobo)}
          </dd>
          <dt>Pays no order</dt>
          <dd>{tally(books.notTied)}</dd>
          <dt>Refunds</dt>
          <dd>
            {books.refundsOwed.count + books.refundsSent.count
              ? `${formatNaira(books.refundsOwed.kobo)} owed · ${formatNaira(books.refundsSent.kobo)} sent`
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
                        `, ${formatNaira(o.dueKobo)}`}: {o.status}
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

      <section aria-labelledby="books-chat-h">
        <h4 id="books-chat-h">Ask about these books</h4>
        <p className="hint">
          Answers come from Google&apos;s Gemini service, which is sent only the
          totals and order numbers above and your questions. Your first question
          shows you everything before it goes.
        </p>
        {turns.length > 0 && (
          <ol className="books-chat" aria-live="polite">
            {turns.map((t, i) => (
              <li key={i}>
                <p className="asked">{t.question}</p>
                {t.answer ? (
                  <>
                    <p>{t.answer.fields.text}</p>
                    {t.answer.fields.chart && recent && (
                      <Chart
                        spec={chartSpec(
                          recent,
                          t.answer.fields.chart,
                          bankName,
                        )}
                      />
                    )}
                    {props.badge(t.answer)}
                  </>
                ) : t.error ? (
                  <p className="error" role="alert">
                    {t.error}
                  </p>
                ) : (
                  <p className="hint">Asking…</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {sent !== null && sent !== totals && (
          <p className="hint">
            The books have changed since your first question, and this chat
            still uses the ones you sent.{' '}
            <button type="button" className="link" onClick={startOver}>
              Start over with the new books
            </button>
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label htmlFor="books-q">Your question</label>
          <input
            id="books-q"
            value={question}
            placeholder="How much is still owed today?"
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!books || empty === true}
          />
          <div className="actions">
            <button type="submit" disabled={busy || !question.trim()}>
              {busy ? 'Asking…' : 'Ask'}
            </button>
            {turns.length > 0 && !busy && (
              <button type="button" className="quiet" onClick={startOver}>
                Clear the chat
              </button>
            )}
          </div>
        </form>
      </section>
    </details>
  )
}
