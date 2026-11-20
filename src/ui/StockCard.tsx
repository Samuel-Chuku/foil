import { useState } from 'react'
import { leftOf, mergeProducts, parsePriceList } from '../capture/stock'
import type { Product } from '../ledger/types'
import { parseNairaKobo } from '../verify/money'
import type { LedgerApi } from './useLedger'

type Row = { id: string | null; name: string; price: string; qty: string }

const toRow = (p: Product): Row => ({
  id: p.id,
  name: p.name,
  price: p.priceKobo === null ? '' : String(p.priceKobo / 100),
  qty: p.qty === null ? '' : String(p.qty),
})

// The vendor's list as typed. A changed count is a fresh count from now, so
// earlier paid orders stop reducing it.
function fromRows(rows: Row[], before: Product[], now: number): Product[] {
  return rows.flatMap((r) => {
    const name = r.name.trim()
    if (!name) return []
    const priceKobo = parseNairaKobo(r.price)
    const parsed = Number.parseInt(r.qty, 10)
    const qty = r.qty.trim() === '' || Number.isNaN(parsed) ? null : parsed
    const old = before.find((p) => p.id === r.id)
    return [
      {
        id: old?.id ?? r.id ?? crypto.randomUUID(),
        name,
        priceKobo,
        qty,
        countedAt: old && old.qty === qty ? old.countedAt : now,
        updatedAt:
          old &&
          old.name === name &&
          old.priceKobo === priceKobo &&
          old.qty === qty
            ? old.updatedAt
            : now,
      },
    ]
  })
}

export function StockCard(props: { ledger: LedgerApi }) {
  const { ledger } = props
  const products = ledger.data?.products ?? []
  const orders = ledger.data?.orders ?? []
  const [rows, setRows] = useState<Row[] | null>(null)
  const [paste, setPaste] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const r = rows ?? products.map(toRow)
  const edit = (next: Row[]) => {
    setRows(next)
    setNote(null)
  }
  const set = (n: number, field: keyof Row, value: string) =>
    edit(r.map((x, k) => (k === n ? { ...x, [field]: value } : x)))

  const soldOut = products.filter((p) => {
    const left = leftOf(p, orders, products)
    return left !== null && left <= 0
  }).length
  const left = (row: Row) => {
    const p = products.find((x) => x.id === row.id)
    if (!p || p.qty === null) return null
    return leftOf(p, orders, products)
  }

  function addPasted() {
    // Typed rows first, so a pasted line updates what is on screen.
    const now = Date.now()
    const listed = parsePriceList(paste)
    if (listed.length === 0) {
      setNote('No products found. Put one product on each line.')
      return
    }
    edit(mergeProducts(fromRows(r, products, now), listed, now).map(toRow))
    setPaste('')
    setNote(
      `${listed.length} line${listed.length === 1 ? '' : 's'} added. Check them, then save.`,
    )
  }

  return (
    <details className="card shop-rules">
      <summary>
        <h3>Stock</h3>
        <span className="hint">
          {products.length === 0
            ? 'No products yet. Drafts will not quote prices or stock.'
            : `${products.length} products${soldOut ? `, ${soldOut} sold out` : ''}.`}
        </span>
      </summary>
      <form
        className="order-form"
        onSubmit={(e) => {
          e.preventDefault()
          void ledger
            .saveProducts(fromRows(r, products, Date.now()))
            .then(() => {
              setRows(null)
              setNote('Saved. Paid orders count down from here.')
            })
        }}
      >
        <p className="hint">
          List what you sell. Leave the quantity empty for anything you
          don&apos;t count. Each paid order takes its items off what is left,
          and drafts tell customers honestly when something is sold out.
        </p>
        {r.length === 0 && <p className="empty">No products yet.</p>}
        {r.map((row, n) => {
          const l = left(row)
          return (
            <div key={row.id ?? `new-${n}`} className="stock-row">
              <label>
                Product
                <input
                  value={row.name}
                  onChange={(e) => set(n, 'name', e.target.value)}
                />
              </label>
              <label>
                Price (₦)
                <input
                  inputMode="decimal"
                  value={row.price}
                  onChange={(e) => set(n, 'price', e.target.value)}
                />
              </label>
              <label>
                Qty
                <input
                  inputMode="numeric"
                  value={row.qty}
                  onChange={(e) => set(n, 'qty', e.target.value)}
                />
              </label>
              <span className="left" data-out={l !== null && l <= 0}>
                {l === null ? '' : l <= 0 ? 'Sold out' : `${l} left`}
              </span>
              <button
                type="button"
                className="link"
                aria-label={`Remove ${row.name || 'this product'}`}
                onClick={() => edit(r.filter((_, k) => k !== n))}
              >
                Remove
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="quiet"
          onClick={() =>
            edit([...r, { id: null, name: '', price: '', qty: '' }])
          }
        >
          Add a product
        </button>
        <label>
          Or paste your price list, one product per line
          <textarea
            rows={4}
            value={paste}
            placeholder={'Ankara gown - ₦15,000 - 3 left\nSilk scarf 5k (10)'}
            onChange={(e) => setPaste(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="quiet"
          disabled={!paste.trim()}
          onClick={addPasted}
        >
          Read the list
        </button>
        <button type="submit" disabled={rows === null}>
          Save stock
        </button>
        {note && <p aria-live="polite">{note}</p>}
        <p className="hint">
          When a chat names an item without a price, its price comes from this
          list.
        </p>
      </form>
    </details>
  )
}
