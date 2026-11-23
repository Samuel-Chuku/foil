import { useEffect, useState } from 'react'
import { triage } from '../ai/triage'
import {
  buildQueue,
  latestAsk,
  SECTION_TITLE,
  type Section,
} from '../queue/queue'
import { formatMoney } from '../verify/money'
import { NeedsConsent, type DeviceApi } from './useDevice'
import type { LedgerApi } from './useLedger'
import { Icon } from './icons'

const LABEL_TEXT = {
  order: 'Order',
  payment: 'Payment',
  question: 'Question',
  complaint: 'Complaint',
  other: 'Other',
} as const

// Everyone waiting on the vendor, in the order they most need attention.
export function QueueCard(props: {
  ledger: LedgerApi
  device: DeviceApi
  delivers: boolean
  // Opens that customer's chat where the host can (the demo); WhatsApp Web
  // is never driven by the desk.
  onOpen?: (key: string) => void
}) {
  const { ledger, device } = props
  const data = ledger.data
  const [sorting, setSorting] = useState<
    | { state: 'running' }
    | { state: 'done'; text: string }
    | { state: 'error'; text: string }
    | null
  >(null)
  // Holds and "today" move with the clock, so the queue looks again each
  // half minute.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  if (!data) return null

  const entries = buildQueue({
    orders: data.orders,
    credits: data.credits,
    customers: data.customers,
    chats: data.chats,
    drops: data.drops,
    products: data.products,
    delivers: props.delivers,
    now,
  })
  // Chats whose latest customer words have no label yet.
  const unsorted = data.chats.filter(
    (c) =>
      c.lastFrom === 'customer' &&
      latestAsk(c) &&
      c.labelledText !== latestAsk(c),
  )

  async function sort() {
    setSorting({ state: 'running' })
    try {
      await device.ready()
      const texts = unsorted.map(latestAsk)
      const r = await triage(texts, device.consent)
      await ledger.labelChats(
        unsorted.flatMap((c, n) => {
          const label = r.labels[n]
          return label ? [{ id: c.id, label }] : []
        }),
      )
      const done = r.labels.filter(Boolean).length
      setSorting({
        state: 'done',
        text: `${done} of ${texts.length} sorted ${r.source === 'Cloud' ? 'in the cloud' : 'on this computer'} in ${(r.ms / 1000).toFixed(1)} s.`,
      })
    } catch (e) {
      setSorting({
        state: 'error',
        text:
          e instanceof NeedsConsent
            ? `${e.message} Choose at the top of the panel how to sort chats.`
            : e instanceof Error
              ? e.message
              : String(e),
      })
    }
  }

  const sections = [...new Set(entries.map((e) => e.section))] as Section[]

  return (
    <section className="card queue" data-tone="ask" aria-labelledby="queue-h">
      <h3 id="queue-h">
        <Icon name="bell" />
        Who needs you
      </h3>
      {entries.length === 0 ? (
        <p className="empty">
          Nobody is waiting. Chats appear here once you open them with the desk,
          and orders once you capture them.
        </p>
      ) : (
        sections.map((section) => (
          <div key={section} className="queue-section" data-section={section}>
            <h4>
              {SECTION_TITLE[section]}{' '}
              <span>{entries.filter((e) => e.section === section).length}</span>
            </h4>
            <ul>
              {entries
                .filter((e) => e.section === section)
                .map((e) => (
                  <li key={e.key}>
                    <span className="who">
                      {props.onOpen ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => props.onOpen?.(e.key)}
                        >
                          {e.name}
                        </button>
                      ) : (
                        e.name
                      )}
                      {e.label && (
                        <span className="tag" data-label={e.label}>
                          {LABEL_TEXT[e.label]}
                        </span>
                      )}
                    </span>
                    <span className="hint">
                      {e.why}
                      {e.order?.amountKobo != null &&
                        ` Order ${e.order.code}, ${formatMoney(e.order.amountKobo)}.`}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
      {unsorted.length > 0 && (
        <button
          type="button"
          className="quiet"
          disabled={sorting?.state === 'running' || device.busy}
          onClick={() => void sort()}
        >
          {sorting?.state === 'running'
            ? 'Sorting…'
            : `Sort ${unsorted.length} unanswered chat${unsorted.length === 1 ? '' : 's'}`}
        </button>
      )}
      {sorting && sorting.state !== 'running' && (
        <p
          className={sorting.state === 'error' ? 'error' : 'hint'}
          aria-live="polite"
        >
          {sorting.text}
        </p>
      )}
      <p className="hint">
        Sorting reads each customer&apos;s latest words on this computer and
        marks them as an order, payment, question, complaint or other.
        Complaints rise to the top.
      </p>
    </section>
  )
}
