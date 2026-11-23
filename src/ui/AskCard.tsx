import type { ChatSession } from 'firebase/ai'
import { useRef, useState, type ReactNode } from 'react'
import {
  askBooks,
  askOnDevice,
  booksChat,
  deskRequest,
  followUpRequest,
} from '../ai/books'
import { market } from '../config/market'
import { chartMenu } from '../ledger/charts'
import type { Reading } from '../ai/run'
import {
  approve,
  redact,
  type Approved,
  type CloudRequest,
} from '../cloud/approval'
import { cloudErrorText } from '../cloud/send'
import type { ShopRules } from '../capture/shopRules'
import { chartSpec } from '../ledger/charts'
import { booksText, dayBooks } from '../ledger/dayBooks'
import type { Answer } from '../ledger/report'
import {
  businessText,
  deskInstructions,
  deviceAskPrompt,
  repairOrderNumbers,
} from '../ledger/snapshot'
import { trends, trendsText } from '../ledger/trends'
import { Chart } from './Chart'
import type { Lagos } from './TrendsCard'
import type { LedgerApi } from './useLedger'

// The week to today against the week before, for "how did this week go?".
const SPAN = 7

const SUGGESTIONS = [
  'Which orders are still unpaid?',
  'Which orders still need sending?',
  'What should I restock?',
  'How did this week compare with last?',
]

type Turn = {
  question: string
  answer?: Reading<Answer>
  error?: string
}

// A chat about the whole business, on every tab. With Chrome's model ready,
// questions are answered on this computer and nothing leaves it. Otherwise,
// or when the vendor asks for it, the cloud answers after the vendor sees
// exactly what is sent: the shop's own facts, never a customer's name, phone
// or address.
export function AskCard(props: {
  ledger: LedgerApi
  rules: ShopRules
  today: string
  lagos: Lagos
  now: () => number
  online: boolean
  ask: (request: CloudRequest) => Promise<Approved | null>
  badge: (r: Reading<unknown>) => ReactNode
  // Whether Chrome's built-in model is ready on this computer.
  deviceReady: boolean
}) {
  const { data, config } = props.ledger
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Bank not known'
  const recent = data
    ? trends(props.today, SPAN, data, config, props.lagos)
    : null
  const facts =
    data && recent
      ? businessText({
          books: booksText(
            dayBooks(props.today, data, config, props.lagos.day),
          ),
          trends: trendsText(recent, bankName),
          orders: data.orders,
          credits: data.credits,
          products: data.products,
          drops: data.drops,
          settlements: data.settlements,
          chats: data.chats,
          rules: props.rules,
          now: props.now(),
        })
      : ''

  // Whether the records themselves changed, rather than the text: the demo's
  // sample clock drifts, which can move an order across an hour without any
  // record changing.
  const records = data
    ? [
        data.orders.length,
        Math.max(0, ...data.orders.map((o) => o.updatedAt)),
        data.credits.length,
        data.settlements.length,
        Math.max(0, ...data.products.map((p) => p.updatedAt)),
      ].join(':')
    : ''

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

  // On the device when the model is ready and the market's reply language is
  // one it supports; the cloud otherwise.
  const onDevice = props.deviceReady && market().reply.onDevice

  async function send(asked: string, viaCloud = false) {
    const typed = asked.trim()
    if (!typed || !facts || busy) return
    if (onDevice && !viaCloud) {
      const prompt = deviceAskPrompt(
        deskInstructions(),
        chartMenu(),
        facts,
        turns.flatMap((t) =>
          t.answer?.source === 'On device'
            ? [{ question: t.question, answer: t.answer.fields.text }]
            : [],
        ),
        typed,
      )
      if (prompt) {
        setQuestion('')
        setBusy(true)
        const at = turns.length
        setTurns((t) => [...t, { question: typed }])
        try {
          const read = await askOnDevice(prompt)
          // Order numbers are checked against the shop's real orders.
          const answer = {
            ...read,
            fields: {
              ...read.fields,
              text: repairOrderNumbers(
                read.fields.text,
                (data?.orders ?? []).map((o) => o.code),
              ),
            },
          }
          setTurns((t) => t.map((x, i) => (i === at ? { ...x, answer } : x)))
        } catch (e) {
          const error = cloudErrorText(e)
          setTurns((t) => t.map((x, i) => (i === at ? { ...x, error } : x)))
        } finally {
          setBusy(false)
        }
        return
      }
      // Too long for the device: the cloud path below asks first.
    }
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
      ? deskRequest(facts, text, replaced)
      : followUpRequest(text, replaced)
    // A follow-up the vendor typed and nothing was swapped in is already on
    // screen exactly as it will be sent, so their Ask click is the approval.
    const approved =
      first || replaced.length ? await props.ask(request) : approve(request)
    if (!approved) return
    chat.current ??= booksChat()
    if (first) setSent(records)
    setQuestion('')
    setBusy(true)
    const at = turns.length
    setTurns((t) => [...t, { question: text }])
    try {
      const answer = await askBooks(chat.current, approved)
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, answer } : x)))
    } catch (e) {
      const error = cloudErrorText(e)
      setTurns((t) => t.map((x, i) => (i === at ? { ...x, error } : x)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card ask-desk" data-tone="ask" aria-labelledby="ask-h">
      <h3 id="ask-h">Ask the desk</h3>
      {turns.length === 0 && (
        <p className="hint">
          {onDevice
            ? 'Ask anything about your orders, stock, money or week. Answers come from the model on this computer, so nothing is sent. For a harder question, you can ask the cloud instead.'
            : "Ask anything about your orders, stock, money or week. Answers come from Google's Gemini service, and your first question shows you exactly what it will be sent: your shop's facts, never customers' names, phones or addresses."}
        </p>
      )}
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
                      spec={chartSpec(recent, t.answer.fields.chart, bankName)}
                    />
                  )}
                  {props.badge(t.answer)}
                  {t.answer.source === 'On device' && !busy && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => void send(t.question, true)}
                    >
                      Ask the cloud instead
                    </button>
                  )}
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
      {sent !== null && sent !== records && (
        <p className="hint">
          Your records have changed since your first question, and this chat
          still uses what you sent then.{' '}
          <button type="button" className="link" onClick={startOver}>
            Start over with the latest
          </button>
        </p>
      )}
      {turns.length === 0 && (
        <div className="suggestions" role="group" aria-label="Try asking">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="quiet"
              disabled={busy || !facts}
              onClick={() => void send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(question)
        }}
      >
        <label htmlFor="ask-q" className="visually-hidden">
          Your question
        </label>
        <input
          id="ask-q"
          value={question}
          placeholder="Ask about your orders, stock or money"
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!facts}
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
  )
}
