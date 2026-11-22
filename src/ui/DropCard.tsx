import { market } from '../config/market'
import { useEffect, useState } from 'react'
import { DEFAULT_HOLD_MIN, itemState, type Claim } from '../capture/drop'
import type { Drop, Product, ProductPhoto } from '../ledger/types'
import { formatMoney, parseMoney } from '../verify/money'
import { photoFromFile } from './photos'
import type { LedgerApi } from './useLedger'

type NewItem = { photo: ProductPhoto; price: string }

// A drop: one-of-a-kind items posted on status, held for the first to ask
// while they pay, then passed down the line. Everything shown here is worked
// out from the orders and the clock.
export function DropCard(props: {
  ledger: LedgerApi
  clock: (ms: number) => string
}) {
  const { ledger, clock } = props
  const data = ledger.data
  const live = data?.drops.find((d) => d.endedAt === null) ?? null
  const [name, setName] = useState('')
  // A new drop starts with the hold time the shop used last.
  const [typedHold, setHold] = useState<string | null>(null)
  const hold = typedHold ?? String(data?.drops[0]?.holdMin ?? DEFAULT_HOLD_MIN)
  const [items, setItems] = useState<NewItem[]>([])
  const [note, setNote] = useState<string | null>(null)
  // A new hold time typed for the running drop, until saved.
  const [newHold, setNewHold] = useState<string | null>(null)
  // Holds run out on their own, so the card looks again every half minute.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const who = (c: Claim) => {
    const id = c.order.customerId
    const saved = data?.customers.find((x) => x.id === id)?.name
    return saved || (id?.startsWith('name:') ? id.slice(5) : 'a customer')
  }

  async function addPhotos(files: File[]) {
    try {
      const photos = await Promise.all(files.map(photoFromFile))
      setItems((x) => [...x, ...photos.map((photo) => ({ photo, price: '' }))])
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }

  async function start() {
    const holdMin = Math.max(1, Number.parseInt(hold, 10) || DEFAULT_HOLD_MIN)
    const at = Date.now()
    const drop: Drop = {
      id: crypto.randomUUID(),
      name: name.trim() || `Drop of ${clock(at)}`,
      holdMin,
      createdAt: at,
      endedAt: null,
    }
    const products: Product[] = items.map((x, n) => ({
      id: crypto.randomUUID(),
      name: '',
      priceKobo: parseMoney(x.price),
      qty: 1,
      countedAt: at,
      updatedAt: at,
      photo: x.photo,
      dropId: drop.id,
      dropNo: n + 1,
    }))
    await ledger.startDrop(drop, products)
    setItems([])
    setName('')
    setNote(
      'The drop is live. Replies to your status are matched to these photos.',
    )
  }

  if (!data) return null

  if (!live) {
    return (
      <details className="card shop-rules drop">
        <summary>
          <h3>Drop</h3>
          <span className="hint">
            No drop running. Start one before posting one-of-a-kind pieces on
            your status.
          </span>
        </summary>
        <form
          className="order-form"
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <p className="hint">
            Add the photos you will post. Each becomes a numbered item. The
            first customer to ask holds it while they pay; if they do not pay in
            time, it passes to the next in line.
          </p>
          <label>
            Name{' '}
            <input
              value={name}
              placeholder="Saturday thrift drop"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Hold for payment (minutes){' '}
            <input
              inputMode="numeric"
              value={hold}
              onChange={(e) => setHold(e.target.value)}
            />
          </label>
          <label className="file">
            Photos{' '}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (files.length) void addPhotos(files)
              }}
            />
          </label>
          {items.length > 0 && (
            <ol className="drop-items">
              {items.map((x, n) => (
                <li key={n}>
                  <img src={x.photo.thumb} alt={`Item ${n + 1}`} />
                  <span>#{n + 1}</span>
                  <label>
                    Price ({market().currency.symbol})
                    <input
                      inputMode="decimal"
                      value={x.price}
                      onChange={(e) =>
                        setItems((all) =>
                          all.map((y, k) =>
                            k === n ? { ...y, price: e.target.value } : y,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      setItems((all) => all.filter((_, k) => k !== n))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="submit" disabled={items.length === 0}>
            Start the drop
          </button>
          {note && <p aria-live="polite">{note}</p>}
        </form>
      </details>
    )
  }

  const pieces = data.products.filter((p) => p.dropId === live.id)
  const states = pieces.map((p) => ({
    p,
    s: itemState(p, data.orders, live.holdMin, now),
  }))
  const sold = states.filter(
    (x) => x.s.state === 'paid' || x.s.state === 'sold',
  ).length

  return (
    <details className="card shop-rules drop" open>
      <summary>
        <h3>Drop: {live.name}</h3>
        <span className="hint">
          {sold} of {pieces.length} paid · holds last {live.holdMin} min
        </span>
      </summary>
      <ol className="drop-items">
        {states.map(({ p, s }) => (
          <li key={p.id} data-state={s.state}>
            {p.photo && <img src={p.photo.thumb} alt={`Item ${p.dropNo}`} />}
            <span>
              #{p.dropNo}
              {p.priceKobo !== null && ` · ${formatMoney(p.priceKobo)}`}
            </span>
            <span className="drop-status">
              {s.state === 'available' &&
                (s.released.length > 0
                  ? `Available again: ${s.released.map(who).join(', ')} did not pay in time`
                  : 'Available')}
              {s.state === 'held' && (
                <>
                  Held by {who(s.holder)} until {clock(s.until)}
                  {s.waiting.length > 0 &&
                    ` · ${s.waiting.length} waiting`}{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      void ledger
                        .releaseHold(s.holder.order.id)
                        .then(() => setNow(Date.now()))
                    }
                  >
                    End hold
                  </button>
                </>
              )}
              {s.state === 'held' && s.paidWaiting.length > 0 && (
                <span className="hint">
                  {' '}
                  Already paid and waiting: {s.paidWaiting.map(who).join(', ')}.
                  It is theirs if the hold runs out.
                </span>
              )}
              {s.state === 'paid' &&
                `Paid by ${who(s.buyer)}${s.late ? ' after their hold' : ''}`}
              {s.state === 'sold' && `Sold to ${who(s.buyer)}`}
              {(s.state === 'paid' || s.state === 'sold') &&
                s.others
                  .filter((c) => c.order.payment.state === 'matched')
                  .map((c) => (
                    <span key={c.order.id} className="error">
                      {' '}
                      Refund owed to {who(c)}
                      {c.order.amountKobo !== null &&
                        ` (${formatMoney(c.order.amountKobo)})`}
                      : they paid after it went to someone else.
                    </span>
                  ))}
            </span>
          </li>
        ))}
      </ol>
      <form
        className="hold-edit"
        onSubmit={(e) => {
          e.preventDefault()
          const holdMin = Number.parseInt(newHold ?? '', 10)
          if (!holdMin || holdMin < 1) return
          void ledger
            .updateDrop({ ...live, holdMin })
            .then(() => setNewHold(null))
        }}
      >
        <label>
          Hold for payment (minutes){' '}
          <input
            inputMode="numeric"
            value={newHold ?? String(live.holdMin)}
            onChange={(e) => setNewHold(e.target.value)}
          />
        </label>{' '}
        {newHold !== null && newHold !== String(live.holdMin) && (
          <button type="submit" className="quiet">
            Save
          </button>
        )}
      </form>
      <p className="hint">
        A new hold time applies to every hold in this drop, including the
        current one.
      </p>
      <button
        type="button"
        className="quiet"
        onClick={() => void ledger.endDrop(live)}
      >
        End the drop
      </button>
      <p className="hint">
        Customers who ask while an item is held are told their place in line;
        nobody is told who else asked.
      </p>
    </details>
  )
}
