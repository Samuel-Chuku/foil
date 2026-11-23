import { deliveryGroups, nextSteps } from '../capture/deliveries'
import type { Order } from '../ledger/types'
import { formatMoney } from '../verify/money'
import type { LedgerApi } from './useLedger'
import { useState } from 'react'
import { atTime, nextHour } from '../google/calendar'
import { GoogleResult } from './GoogleResult'
import type { GoogleStatus } from './useGoogle'
import { Icon } from './icons'

// The buttons that move one order along: out, delivered or collected.
export function DeliverySteps(props: {
  order: Order
  onSet: (state: Order['delivery']) => void
}) {
  const steps = nextSteps(props.order)
  if (steps.length === 0) return null
  return (
    <div className="actions delivery-steps">
      {steps.map((s) => (
        <button
          key={s.to}
          type="button"
          className={s.undo ? 'link' : 'quiet'}
          onClick={() => props.onSet(s.to)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

// Paid orders still to go out or on their way, grouped by where they go, so
// the vendor can plan the rider's run and mark each one as it happens.
export function DeliveriesCard(props: {
  ledger: LedgerApi
  customerName: (id: string | null) => string
  onOpen?: (customerKey: string) => void
  // Wall-clock now, for the default time of a run.
  now: number
  onAddRun: (area: string, orders: Order[], startMs: number) => void
  runStatus: (area: string) => GoogleStatus | undefined
}) {
  // The time typed for each area's run, until it is added.
  const [times, setTimes] = useState<Record<string, string>>({})
  const defaultTime = new Date(nextHour(props.now)).toISOString().slice(11, 16)
  const { data } = props.ledger
  const groups = data ? deliveryGroups(data.orders, data.credits) : []
  const count = groups.reduce((n, g) => n + g.orders.length, 0)
  // Nothing to send is not news; the card appears when an order is ready,
  // folded to one line so a busy day does not bury the rest of Today.
  if (!data || count === 0) return null
  const out = groups.reduce(
    (n, g) => n + g.orders.filter((x) => x.order.delivery === 'out').length,
    0,
  )
  return (
    <details className="card shop-rules deliveries" data-tone="order">
      <summary>
        <h3>
          <Icon name="truck" />
          Deliveries
        </h3>
        <span className="hint">
          {count - out} to send
          {out > 0 && `, ${out} on the way`}, grouped by area
        </span>
      </summary>
      {groups.map((g) => (
        <div key={g.label} className="delivery-group">
          <h4>
            {g.label} <span className="hint">({g.orders.length})</span>
          </h4>
          <ul>
            {g.orders.map(({ order: o, owedKobo }) => (
              <li key={o.id}>
                <p>
                  <strong>Order {o.code}</strong> ·{' '}
                  {props.onOpen && o.customerId ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() => props.onOpen?.(o.customerId!)}
                    >
                      {props.customerName(o.customerId)}
                    </button>
                  ) : (
                    props.customerName(o.customerId)
                  )}{' '}
                  · {o.items.map((i) => `${i.qty} x ${i.name}`).join(', ')}
                  {o.delivery === 'out' && ' · out for delivery'}
                  {owedKobo > 0 && ` · ${formatMoney(owedKobo)} still owed`}
                </p>
                <DeliverySteps
                  order={o}
                  onSet={(state) => void props.ledger.setDelivery(o.id, state)}
                />
              </li>
            ))}
          </ul>
          {/* Pickups wait for the customer; there is no run to plan. */}
          {g.orders.some((x) => x.order.deliveryPlan?.method !== 'pickup') && (
            <form
              className="run-plan"
              onSubmit={(e) => {
                e.preventDefault()
                const at = atTime(props.now, times[g.label] ?? defaultTime)
                if (at === null) return
                props.onAddRun(
                  g.label,
                  g.orders.map((x) => x.order),
                  at,
                )
              }}
            >
              <label>
                Run at{' '}
                <input
                  type="time"
                  value={times[g.label] ?? defaultTime}
                  onChange={(e) =>
                    setTimes((t) => ({ ...t, [g.label]: e.target.value }))
                  }
                />
              </label>
              <button
                type="submit"
                className="quiet"
                disabled={props.runStatus(g.label)?.kind === 'busy'}
              >
                <Icon name="calendar" />
                Add this run to Calendar
              </button>
            </form>
          )}
          <GoogleResult status={props.runStatus(g.label)} />
        </div>
      ))}
    </details>
  )
}
