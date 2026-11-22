import { useState } from 'react'
import {
  BUILTIN_FONTS,
  isPlain,
  PLAIN_BRAND,
  type Brand,
  type BuiltinFont,
} from '../capture/brand'
import type { CustomerReceipt } from '../capture/customerReceipt'
import { readFont, readLogo } from './brandFiles'
import type { BrandApi } from './useBrand'
import { useReceiptPicture } from './useReceiptPicture'

// A made-up receipt, so the vendor can see their look before any sale.
const preview = (shop: string): CustomerReceipt => ({
  shop,
  orderCode: '12',
  customer: null,
  paidAt: Date.UTC(2026, 10, 21, 15, 42),
  lines: [
    { label: '2 x Headwrap', kobo: 700_000 },
    { label: 'Delivery to Yaba', kobo: 150_000 },
  ],
  totalKobo: 850_000,
  paidKobo: 850_000,
  owedKobo: 0,
  riderNote: null,
  refEnding: '934417',
})

// How receipts look: the shop's logo, colour and font, all optional. With
// none set, receipts use the plain style with the shop's name.
export function ReceiptLookCard(props: { brand: BrandApi; shopName: string }) {
  const saved = props.brand.brand
  const [draft, setDraft] = useState<Brand | null>(null)
  const [colors, setColors] = useState<string[]>([])
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(
    null,
  )
  const look = draft ?? saved
  const sample = preview(props.shopName || 'Your shop')
  const picture = useReceiptPicture(
    look.showOrderNumber ? sample : { ...sample, orderCode: '' },
    look,
  )
  const change = (next: Partial<Brand>) => {
    setNote(null)
    setDraft({ ...look, ...next })
  }

  async function pickLogo(file: File) {
    try {
      const read = await readLogo(file)
      setColors(read.colors)
      change({
        logo: read.logo,
        // A first logo brings its main colour, which the vendor can change.
        color: look.color ?? read.colors[0] ?? null,
      })
    } catch (e) {
      setNote({ error: true, text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function pickFont(file: File) {
    try {
      change({ font: await readFont(file) })
    } catch (e) {
      setNote({ error: true, text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function save(next: Brand) {
    try {
      await props.brand.save(next)
      setDraft(null)
      setNote({
        error: false,
        text: isPlain(next)
          ? 'Saved. Receipts use the plain style.'
          : 'Saved. New receipts use your look.',
      })
    } catch (e) {
      setNote({ error: true, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const fontId = look.font.kind === 'builtin' ? look.font.id : 'file'
  return (
    <details className="card shop-rules receipt-look">
      <summary>
        <h3>Receipt look</h3>
        <span className="hint">
          {isPlain(saved)
            ? 'Optional: your logo, colour and font on receipts.'
            : 'Your logo, colour and font are on receipts.'}
        </span>
      </summary>
      {props.brand.error && (
        <p className="error" role="alert">
          Your saved receipt look could not be opened, so receipts use the plain
          style for now. Reload the panel to try again.
        </p>
      )}
      <p className="hint">
        All optional, and kept on this computer. Without them, receipts show
        your shop name in a plain style.
      </p>

      <fieldset>
        <legend>Logo</legend>
        {look.logo && (
          <img src={look.logo} alt="Your logo" className="logo-preview" />
        )}
        <label>
          {look.logo ? 'Choose another logo' : 'Choose your logo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void pickLogo(file)
            }}
          />
        </label>
        {look.logo && (
          <button
            type="button"
            className="link"
            onClick={() => change({ logo: null })}
          >
            Remove the logo
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Colour</legend>
        {colors.length > 0 && (
          <div className="swatches" role="group" aria-label="From your logo">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch-pick"
                style={{ background: c }}
                aria-label={`Use ${c}, from your logo`}
                aria-pressed={look.color === c}
                onClick={() => change({ color: c })}
              />
            ))}
          </div>
        )}
        <label>
          Pick a colour
          <input
            type="color"
            value={look.color ?? '#1d3b53'}
            onChange={(e) => change({ color: e.target.value })}
          />
        </label>
        {look.color && (
          <button
            type="button"
            className="link"
            onClick={() => change({ color: null })}
          >
            No colour
          </button>
        )}
        <p className="hint">
          Words on your colour turn white or dark, whichever reads better. The
          green paid mark stays green so customers always recognise it.
        </p>
      </fieldset>

      <fieldset>
        <legend>Font</legend>
        {(Object.keys(BUILTIN_FONTS) as BuiltinFont[]).map((id) => (
          <label key={id} style={{ fontFamily: BUILTIN_FONTS[id].stack }}>
            <input
              type="radio"
              name="receipt-font"
              checked={fontId === id}
              onChange={() => change({ font: { kind: 'builtin', id } })}
            />{' '}
            {BUILTIN_FONTS[id].label}
          </label>
        ))}
        {look.font.kind === 'file' && (
          <label>
            <input type="radio" name="receipt-font" checked readOnly /> Your
            font: {look.font.name}
          </label>
        )}
        <label>
          Use your own font file
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void pickFont(file)
            }}
          />
        </label>
      </fieldset>

      <label>
        <input
          type="checkbox"
          checked={look.showOrderNumber}
          onChange={(e) => change({ showOrderNumber: e.target.checked })}
        />{' '}
        Show the order number on receipts
      </label>

      <h4>Preview</h4>
      {picture ? (
        <img
          src={picture.src}
          alt="A sample receipt in your look"
          className="receipt-preview"
        />
      ) : (
        <p className="hint">Drawing the preview…</p>
      )}
      <div className="actions">
        <button
          type="button"
          disabled={draft === null}
          onClick={() => draft && void save(draft)}
        >
          Save this look
        </button>
        {draft !== null && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setDraft(null)
              setNote(null)
            }}
          >
            Undo changes
          </button>
        )}
        {!isPlain(saved) && (
          <button
            type="button"
            className="quiet"
            onClick={() =>
              void save({
                ...PLAIN_BRAND,
                showOrderNumber: saved.showOrderNumber,
              })
            }
          >
            Back to the plain style
          </button>
        )}
      </div>
      {note && (
        <p
          className={note.error ? 'error' : 'hint'}
          role={note.error ? 'alert' : 'status'}
        >
          {note.text}
        </p>
      )}
    </details>
  )
}
