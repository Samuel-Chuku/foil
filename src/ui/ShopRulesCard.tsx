import { useState } from 'react'
import { pdfText } from '../ai/pdfText'
import { RECEIPT_IMAGE_TYPES } from '../ai/receipt'
import { readRulesImage, readRulesText } from '../ai/shopRules'
import {
  chunkText,
  DELIVERY_METHODS,
  MAX_POLICY_CHARS,
  mergeRead,
  METHOD_LABEL,
  homeOf,
  type DeliveryMethod,
  type ShopRules,
} from '../capture/shopRules'
import { STATES, type State } from '../capture/places'
import { parseNairaKobo } from '../verify/money'
import { fileToImage } from './bankApp'
import { NeedsConsent, type DeviceApi } from './useDevice'
import type { ShopRulesApi } from './useShopRules'

type Form = {
  shopName: string
  homeState: ShopRules['homeState']
  methods: DeliveryMethod[]
  areas: { area: string; fee: string }[]
  otherFee: string
  parks: { state: string; park: string; fee: string }[]
  pickupAddress: string
  pickupHours: string
  refundTerms: string
  policies: string
  paymentWaitMin: number
  fromFile: string[]
}

const naira = (kobo: number) => String(kobo / 100)

const toForm = (r: ShopRules): Form => ({
  shopName: r.shopName,
  homeState: r.homeState,
  methods: r.methods,
  areas: r.areaFees.map((f) => ({ area: f.area, fee: naira(f.feeKobo) })),
  otherFee: r.otherAreasFeeKobo === null ? '' : naira(r.otherAreasFeeKobo),
  parks: r.parks.map((p) => ({
    state: p.state,
    park: p.park,
    fee: naira(p.feeKobo),
  })),
  pickupAddress: r.pickupAddress,
  pickupHours: r.pickupHours,
  refundTerms: r.refundTerms,
  policies: r.policies,
  paymentWaitMin: r.paymentWaitMin,
  fromFile: r.fromFile,
})

const fromForm = (f: Form): ShopRules => ({
  shopName: f.shopName.trim(),
  homeState: f.homeState,
  methods: f.methods,
  areaFees: f.areas.flatMap((x) => {
    const feeKobo = parseNairaKobo(x.fee)
    return x.area.trim() && feeKobo !== null
      ? [{ area: x.area.trim(), feeKobo }]
      : []
  }),
  otherAreasFeeKobo: parseNairaKobo(f.otherFee),
  parks: f.parks.flatMap((x) => {
    const feeKobo = parseNairaKobo(x.fee)
    return x.state.trim() && feeKobo !== null
      ? [{ state: x.state.trim(), park: x.park.trim(), feeKobo }]
      : []
  }),
  pickupAddress: f.pickupAddress.trim(),
  pickupHours: f.pickupHours.trim(),
  refundTerms: f.refundTerms.trim(),
  policies: f.policies.trim().slice(0, MAX_POLICY_CHARS),
  paymentWaitMin: f.paymentWaitMin,
  fromFile: f.fromFile,
})

// Long documents take a while on the device; past this many parts the rest
// is kept as text for drafts but not read into fields.
const MAX_PARTS = 4

const isPdf = (f: File) =>
  f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

function Checked(props: { field: string; form: Form }) {
  return props.form.fromFile.includes(props.field) ? (
    <span className="from-file">Read from your file: check it</span>
  ) : null
}

export function ShopRulesCard(props: {
  shop: ShopRulesApi
  device: DeviceApi
}) {
  const { shop, device } = props
  // Edits and file readings stay in the form until saved.
  const [form, setForm] = useState<Form | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const f = form ?? toForm(shop.rules)
  const edit = (next: Partial<Form>, field?: string) => {
    setNote(null)
    setForm({
      ...f,
      ...next,
      // Editing a field the model filled counts as checking it.
      fromFile: field ? f.fromFile.filter((x) => x !== field) : f.fromFile,
    })
  }

  // Reads each file on the device: text into the policies, and any rule that
  // matches a field into that field, where the vendor left it empty.
  async function upload(files: File[]) {
    let next = f
    try {
      await device.ready()
      for (const [n, file] of files.entries()) {
        const label = files.length > 1 ? ` (${n + 1} of ${files.length})` : ''
        if (RECEIPT_IMAGE_TYPES.includes(file.type)) {
          setReading(`Reading ${file.name}${label}…`)
          const r = await readRulesImage(
            await fileToImage(file),
            device.consent,
          )
          next = {
            ...toForm(mergeRead(fromForm(next), r.fields)),
            policies: [next.policies, r.fields.otherRules]
              .map((x) => x.trim())
              .filter(Boolean)
              .join('\n\n'),
          }
          continue
        }
        const text = (
          isPdf(file)
            ? await pdfText(await file.arrayBuffer(), 20)
            : await file.text()
        ).trim()
        if (!text) {
          setNote(`No text could be read from ${file.name}.`)
          continue
        }
        const parts = chunkText(text).slice(0, MAX_PARTS)
        for (const [k, part] of parts.entries()) {
          setReading(
            `Reading ${file.name}${label}${parts.length > 1 ? `, part ${k + 1} of ${parts.length}` : ''}…`,
          )
          const r = await readRulesText(part, device.consent)
          next = {
            ...toForm(mergeRead(fromForm(next), r.fields)),
            policies: next.policies,
          }
        }
        next = {
          ...next,
          policies: [next.policies.trim(), text].filter(Boolean).join('\n\n'),
        }
      }
      setForm(next)
      setNote(
        next.fromFile.length > 0
          ? 'Filled what your files say. Check the marked fields, then save.'
          : 'Added the text of your files. No fields could be filled from them; check it, then save.',
      )
    } catch (e) {
      setForm(next)
      setNote(
        e instanceof NeedsConsent
          ? `${e.message} Choose at the top of the panel how to read files. The text you typed is unchanged.`
          : `Couldn't read the file: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setReading(null)
    }
  }

  const uses = (m: DeliveryMethod) => f.methods.includes(m)
  // What the address says when the vendor has not chosen a state.
  const inferred = homeOf({ ...fromForm(f), homeState: '' })
  const r = shop.rules
  const summary = [
    r.methods.length > 0 && `${r.methods.length} delivery options`,
    r.refundTerms && 'refund terms',
    r.policies && 'your policies',
  ].filter(Boolean)

  return (
    <details className="card shop-rules">
      <summary>
        <h3>Shop rules</h3>
        <span className="hint">
          {summary.length > 0
            ? `Drafts use: ${summary.join(', ')}.`
            : 'Not set yet. Drafts will not quote fees, hours or policies.'}
        </span>
      </summary>
      {shop.error && (
        <p className="error" role="alert">
          Your saved rules could not be opened on this computer, so drafts will
          not use them for now. Reload the panel to try again.
        </p>
      )}
      <form
        className="order-form"
        onSubmit={(e) => {
          e.preventDefault()
          // Saving is the vendor's check of everything read from files.
          void shop.save({ ...fromForm(f), fromFile: [] }).then(() => {
            setForm(null)
            setNote('Saved. New drafts will use these rules.')
          })
        }}
      >
        <p className="hint">
          Answer what you can, or just add your files and let the desk fill this
          in. Everything stays on this computer, and drafts never make up terms
          you have not set.
        </p>
        <label>
          Shop name
          <input
            value={f.shopName}
            placeholder="As customers know it, for receipts"
            onChange={(e) => edit({ shopName: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>1. How do you deliver?</legend>
          <p className="hint">
            Tick all that apply, or leave them all unticked if you don&apos;t
            deliver, for example for services or digital goods.
          </p>
          <Checked field="methods" form={f} />
          <label>
            Where is your shop?{' '}
            <select
              value={f.homeState}
              onChange={(e) =>
                edit({ homeState: e.target.value as State | '' })
              }
            >
              <option value="">
                {inferred
                  ? `Not chosen (looks like ${inferred === 'FCT' ? 'Abuja' : inferred}, from your address)`
                  : 'Not chosen'}
              </option>
              {STATES.map((st) => (
                <option key={st} value={st}>
                  {st === 'FCT' ? 'Abuja (FCT)' : st}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            A customer in any other state is offered your nationwide option.
          </p>
          {DELIVERY_METHODS.map((m) => (
            <label key={m} className="check">
              <input
                type="checkbox"
                checked={uses(m)}
                onChange={(e) =>
                  edit(
                    {
                      methods: e.target.checked
                        ? [...f.methods, m]
                        : f.methods.filter((x) => x !== m),
                    },
                    'methods',
                  )
                }
              />{' '}
              {METHOD_LABEL[m]}
            </label>
          ))}
          {uses('own-rider') && (
            <div className="sub">
              <p className="hint">
                Fees by area <Checked field="areaFees" form={f} />
              </p>
              {f.areas.map((x, n) => (
                <div key={n} className="fee-row">
                  <label>
                    Area
                    <input
                      value={x.area}
                      onChange={(e) =>
                        edit(
                          {
                            areas: f.areas.map((y, k) =>
                              k === n ? { ...y, area: e.target.value } : y,
                            ),
                          },
                          'areaFees',
                        )
                      }
                    />
                  </label>
                  <label>
                    Fee (₦)
                    <input
                      inputMode="decimal"
                      value={x.fee}
                      onChange={(e) =>
                        edit(
                          {
                            areas: f.areas.map((y, k) =>
                              k === n ? { ...y, fee: e.target.value } : y,
                            ),
                          },
                          'areaFees',
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      edit(
                        { areas: f.areas.filter((_, k) => k !== n) },
                        'areaFees',
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  edit({ areas: [...f.areas, { area: '', fee: '' }] })
                }
              >
                Add an area
              </button>
              <label>
                Fee for other areas (₦, empty if you quote each time){' '}
                <Checked field="otherAreasFeeKobo" form={f} />
                <input
                  inputMode="decimal"
                  value={f.otherFee}
                  onChange={(e) =>
                    edit({ otherFee: e.target.value }, 'otherAreasFeeKobo')
                  }
                />
              </label>
            </div>
          )}
          {uses('nationwide') && (
            <div className="sub">
              <p className="hint">
                States, parks and prices <Checked field="parks" form={f} />
              </p>
              {f.parks.map((x, n) => (
                <div key={n} className="park-row">
                  {(
                    [
                      ['state', 'State'],
                      ['park', 'Park'],
                      ['fee', 'Fee (₦)'],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k}>
                      {label}
                      <input
                        inputMode={k === 'fee' ? 'decimal' : undefined}
                        value={x[k]}
                        onChange={(e) =>
                          edit(
                            {
                              parks: f.parks.map((y, j) =>
                                j === n ? { ...y, [k]: e.target.value } : y,
                              ),
                            },
                            'parks',
                          )
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      edit(
                        { parks: f.parks.filter((_, j) => j !== n) },
                        'parks',
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  edit({
                    parks: [...f.parks, { state: '', park: '', fee: '' }],
                  })
                }
              >
                Add a state or park
              </button>
            </div>
          )}
          {(uses('courier') || uses('customer-rider')) && (
            <p className="hint">
              Courier and customer-rider prices are agreed in each chat, so
              there is nothing to fill in here.
            </p>
          )}
        </fieldset>
        {uses('pickup') && (
          <fieldset>
            <legend>2. Pickup</legend>
            <label>
              Address <Checked field="pickupAddress" form={f} />
              <input
                value={f.pickupAddress}
                onChange={(e) =>
                  edit({ pickupAddress: e.target.value }, 'pickupAddress')
                }
              />
            </label>
            <label>
              Hours <Checked field="pickupHours" form={f} />
              <input
                value={f.pickupHours}
                placeholder="Mon to Sat, 10am to 6pm"
                onChange={(e) =>
                  edit({ pickupHours: e.target.value }, 'pickupHours')
                }
              />
            </label>
          </fieldset>
        )}
        <label>
          {uses('pickup') ? '3.' : '2.'} Refunds and exchanges{' '}
          <Checked field="refundTerms" form={f} />
          <input
            value={f.refundTerms}
            placeholder="Exchanges within 3 days with the tag on"
            onChange={(e) =>
              edit({ refundTerms: e.target.value }, 'refundTerms')
            }
          />
        </label>
        <fieldset>
          <legend>{uses('pickup') ? '4.' : '3.'} Everything else</legend>
          <label className="file">
            Add files: PDF, text or screenshots{' '}
            <input
              type="file"
              multiple
              disabled={reading !== null}
              accept=".txt,.md,.pdf,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (files.length) void upload(files)
              }}
            />
          </label>
          {reading && <p aria-live="polite">{reading}</p>}
          <label>
            Or type them
            <textarea
              rows={4}
              value={f.policies}
              placeholder="One rule per paragraph"
              onChange={(e) => edit({ policies: e.target.value })}
            />
          </label>
          {f.policies.length >= MAX_POLICY_CHARS && (
            <p className="hint">
              Only the first {MAX_POLICY_CHARS.toLocaleString()} characters are
              kept.
            </p>
          )}
        </fieldset>
        {note && <p aria-live="polite">{note}</p>}
        <button type="submit" disabled={reading !== null}>
          Save rules
        </button>{' '}
        {form && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setForm(null)
              setNote(null)
            }}
          >
            Discard changes
          </button>
        )}
      </form>
    </details>
  )
}
