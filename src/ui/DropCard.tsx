import { useEffect, useState } from 'react'
import { itemState, type Claim } from '../capture/drop'
import type { Drop, Product, ProductPhoto } from '../ledger/types'
import { formatNaira, parseNairaKobo } from '../verify/money'
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
  const [hold, setHold] = useState('30')
  const [items, setItems] = useState<NewItem[]>([])
  const [note, setNote] = useState<string | null>(null)
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
    const holdMin = Math.max(1, Number.parseInt(hold, 10) || 30)
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
      priceKobo: parseNairaKobo(x.price),
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
                    Price (₦)
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
              {p.priceKobo !== null && ` · ${formatNaira(p.priceKobo)}`}
            </span>
            <span className="drop-status">
              {s.state === 'available' && 'Available'}
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
              {s.state === 'paid' && `Paid by ${who(s.buyer)}`}
              {s.state === 'sold' && `Sold to ${who(s.buyer)}`}
            </span>
          </li>
        ))}
      </ol>
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
