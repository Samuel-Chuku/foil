import { useState } from 'react'
import { dayBooks } from '../ledger/dayBooks'
import { ownerSummary, statusUpdate } from '../ledger/daySummary'
import { leftOf } from '../capture/stock'
import { formatMoney } from '../verify/money'
import { dayTitle } from './dayTitle'
import { Icon } from './icons'
import { useShopClock } from './useShopClock'
import { loadingLine, type LedgerApi } from './useLedger'

type Kind = 'owner' | 'status'

// The day closed in a few lines, ready to share: the money for the vendor
// or a partner, or a status for customers with no figures or names. Built
// by rules from the books on this computer; nothing is sent.
export function DaySummaryCard(props: {
  ledger: LedgerApi
  shopName: string
  // Places the text in the open chat's message box, when a chat is open.
  onInsert?: (text: string) => Promise<void>
}) {
  const { data, config } = props.ledger
  const clock = useShopClock()
  const [kind, setKind] = useState<Kind>('owner')
  const [said, setSaid] = useState('')
  const today = clock.today()
  const text = !data
    ? ''
    : kind === 'owner'
      ? ownerSummary(dayBooks(today, data, config, clock.day), {
          shop: props.shopName,
          dayTitle: dayTitle(today),
          money: formatMoney,
        })
      : (() => {
          const stock = data.products.filter((p) => p.name.trim() && !p.dropId)
          const left = stock.map((p) => ({
            name: p.name.trim(),
            left: leftOf(p, data.orders, data.products),
          }))
          return statusUpdate({
            shop: props.shopName,
            orders: data.orders.filter((o) => clock.day(o) === today).length,
            available: left.flatMap((p) =>
              p.left === null || p.left > 0 ? [p.name] : [],
            ),
            soldOut: left.flatMap((p) => (p.left === 0 ? [p.name] : [])),
          })
        })()

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setSaid('Copied. Paste it into WhatsApp.')
    } catch {
      setSaid('Chrome did not allow copying. Select the text and copy it.')
    }
  }

  return (
    <section
      className="card day-summary"
      data-tone="money"
      aria-labelledby="day-summary-h"
    >
      <h3 id="day-summary-h">
        <Icon name="book" />
        Close the day
      </h3>
      <div className="segmented" role="radiogroup" aria-label="Who it is for">
        {(
          [
            ['owner', 'For you or a partner'],
            ['status', 'For your status'],
          ] as const
        ).map(([k, label]) => (
          <label key={k}>
            <input
              type="radio"
              name="day-summary-kind"
              checked={kind === k}
              onChange={() => {
                setKind(k)
                setSaid('')
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {!data ? (
        <p className="empty">{loadingLine(props.ledger)}</p>
      ) : (
        <>
          <pre className="day-summary-text" aria-live="polite">
            {text}
          </pre>
          <p className="hint">
            {kind === 'owner'
              ? "Worked out on this computer from today's books. Nothing is sent."
              : 'No amounts, names or numbers: only what is still in stock. Nothing is sent.'}
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => void copy()}
            >
              Copy
            </button>
            {props.onInsert && (
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  void props.onInsert?.(text).then(
                    () =>
                      setSaid(
                        'It is in the message box of the open chat. It has not been sent.',
                      ),
                    (e: unknown) =>
                      setSaid(e instanceof Error ? e.message : String(e)),
                  )
                }
              >
                Put it in the open chat
              </button>
            )}
          </div>
          {said && <p role="status">{said}</p>}
        </>
      )}
    </section>
  )
}
