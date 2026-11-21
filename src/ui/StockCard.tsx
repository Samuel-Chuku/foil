import { useState } from 'react'
import { suggestLabel } from '../ai/productLabel'
import { leftOf, mergeProducts, parsePriceList } from '../capture/stock'
import type { Product, ProductPhoto } from '../ledger/types'
import { parseNairaKobo } from '../verify/money'
import { photoFromFile } from './photos'
import { NeedsConsent, type DeviceApi } from './useDevice'
import type { LedgerApi } from './useLedger'

type Row = {
  id: string | null
  name: string
  price: string
  qty: string
  photo?: ProductPhoto
}

const toRow = (p: Product): Row => ({
  id: p.id,
  name: p.name,
  price: p.priceKobo === null ? '' : String(p.priceKobo / 100),
  qty: p.qty === null ? '' : String(p.qty),
  ...(p.photo && { photo: p.photo }),
})

const IMAGE_TYPES = 'image/png,image/jpeg,image/webp'

// The vendor's list as typed. A changed count is a fresh count from now, so
// earlier paid orders stop reducing it.
function fromRows(rows: Row[], before: Product[], now: number): Product[] {
  return rows.flatMap((r, rank) => {
    const name = r.name.trim()
    // A thrift piece may have only a photo.
    if (!name && !r.photo) return []
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
          old.qty === qty &&
          old.photo === r.photo &&
          old.rank === rank
            ? old.updatedAt
            : now,
        rank,
        ...(r.photo && { photo: r.photo }),
      },
    ]
  })
}

export function StockCard(props: { ledger: LedgerApi; device: DeviceApi }) {
  const { ledger, device } = props
  const [naming, setNaming] = useState(false)
  const products = (ledger.data?.products ?? []).filter((p) => !p.dropId)
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

  async function addPhotos(files: File[], at?: number) {
    try {
      const photos = await Promise.all(files.map(photoFromFile))
      if (at !== undefined) {
        edit(r.map((x, k) => (k === at ? { ...x, photo: photos[0] } : x)))
        return
      }
      // One of a kind is the usual case for photo-only stock.
      edit([
        ...r,
        ...photos.map((photo) => ({
          id: null,
          name: '',
          price: '',
          qty: '1',
          photo,
        })),
      ])
      setNote(
        `${photos.length} photo${photos.length === 1 ? '' : 's'} added. Add prices, then save.`,
      )
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }

  // Names photo-only rows on the device, one at a time, for the vendor to
  // check. Only rows still without a name are touched.
  async function suggestNames() {
    setNaming(true)
    setNote(null)
    try {
      await device.ready()
      let next = r
      for (let n = 0; n < next.length; n++) {
        const row = next[n]!
        if (row.name.trim() || !row.photo) continue
        const base64 = row.photo.thumb.split(',')[1] ?? ''
        const reading = await suggestLabel(
          { mimeType: 'image/jpeg', base64 },
          device.consent,
        )
        next = next.map((x, k) =>
          k === n && !x.name.trim() ? { ...x, name: reading.fields } : x,
        )
        setRows(next)
      }
      setNote(
        'Names suggested on this computer. Change any that are wrong, then save.',
      )
    } catch (e) {
      setNote(
        e instanceof NeedsConsent
          ? `${e.message} Choose at the top of the panel how to suggest names.`
          : e instanceof Error
            ? e.message
            : String(e),
      )
    } finally {
      setNaming(false)
    }
  }

  function addPasted() {
    // Typed rows first, so a pasted line updates what is on screen.
    // Runs on a click, not during render.
    // oxlint-disable-next-line react/purity
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
          // Runs on submit, not during render.
          // oxlint-disable-next-line react/purity
          const at = Date.now()
          void ledger.saveProducts(fromRows(r, products, at)).then(() => {
            setRows(null)
            setNote('Saved. Paid orders count down from here.')
          })
        }}
      >
        <p className="hint">
          List what you sell, by name, by photo or both. Leave the quantity
          empty for anything you don&apos;t count. A customer&apos;s picture of
          an item, such as a reply to your status, is matched to these photos on
          this computer. Each paid order takes its items off what is left, and
          drafts tell customers honestly when something is sold out.
        </p>
        {r.length === 0 && <p className="empty">No products yet.</p>}
        {r.map((row, n) => {
          const l = left(row)
          return (
            <div key={row.id ?? `new-${n}`} className="stock-row">
              <label className="photo">
                {row.photo ? (
                  <img
                    src={row.photo.thumb}
                    alt={row.name || 'Product photo'}
                  />
                ) : (
                  <span>Add photo</span>
                )}
                <input
                  type="file"
                  accept={IMAGE_TYPES}
                  className="visually-hidden"
                  aria-label={`Photo for ${row.name || 'this product'}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void addPhotos([file], n)
                  }}
                />
              </label>
              <label className="name">
                Product
                <input
                  value={row.name}
                  placeholder={row.photo ? 'Optional with a photo' : ''}
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
              <span className="move">
                <button
                  type="button"
                  className="link"
                  disabled={n === 0}
                  aria-label={`Move ${row.name || 'this product'} to the top`}
                  onClick={() => edit([row, ...r.filter((_, k) => k !== n)])}
                >
                  Top
                </button>
                <button
                  type="button"
                  className="link"
                  disabled={n === 0}
                  aria-label={`Move ${row.name || 'this product'} up`}
                  onClick={() =>
                    edit(
                      r.map((x, k) =>
                        k === n - 1 ? row : k === n ? r[n - 1]! : x,
                      ),
                    )
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="link"
                  disabled={n === r.length - 1}
                  aria-label={`Move ${row.name || 'this product'} down`}
                  onClick={() =>
                    edit(
                      r.map((x, k) =>
                        k === n + 1 ? row : k === n ? r[n + 1]! : x,
                      ),
                    )
                  }
                >
                  ↓
                </button>
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
        <label className="file">
          Add products from photos{' '}
          <input
            type="file"
            accept={IMAGE_TYPES}
            multiple
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) void addPhotos(files)
            }}
          />
        </label>
        {r.some((x) => x.photo && !x.name.trim()) && (
          <button
            type="button"
            className="quiet"
            disabled={naming || device.busy}
            onClick={() => void suggestNames()}
          >
            {naming ? 'Suggesting names…' : 'Suggest names from the photos'}
          </button>
        )}
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
