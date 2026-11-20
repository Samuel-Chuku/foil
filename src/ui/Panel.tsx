import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { writeDraft } from '../ai/draft'
import { readOrder } from '../ai/order'
import { readReceiptImage } from '../ai/receipt'
import type { Reading } from '../ai/run'
import { draftPrompt, draftProblem } from '../capture/draft'
import { toOrderFields } from '../capture/orderFields'
import { transcript } from '../capture/transcript'
import {
  confirmCredit,
  matcherLedger,
  newOrder,
  normalisePhone,
  recordVerdict,
} from '../ledger/ledger'
import type { Order, PaymentState } from '../ledger/types'
import { verifyReceipt, type Verdict } from '../verify/match'
import { formatNaira, parseNairaKobo } from '../verify/money'
import type { RawReceipt } from '../verify/receiptFields'
import { toReceipt } from '../verify/receiptFields'
import type { Receipt } from '../verify/types'
import type { OpenChat, PanelHost } from './host'
import { NeedsConsent, type DeviceApi } from './useDevice'
import type { LedgerApi } from './useLedger'

type Step<T> =
  | { status: 'running'; note: string }
  | { status: 'done'; value: T }
  | { status: 'error'; message: string }

type Verified = {
  reading: Reading<RawReceipt>
  receipt: Receipt
  verdict: Verdict
}

type OrderForm = {
  customerName: string
  address: string
  landmark: string
  area: string
  amount: string
  items: { name: string; qty: string; price: string }[]
}

type Work = {
  verify?: Step<Verified>
  capture?: Step<{
    source: Reading<unknown>['source']
    ms: number
    form: OrderForm
  }>
  draft?: Step<Reading<string>>
  // Why the vendor's choice of credit was refused.
  notice?: string
}

const PAYMENT_LABEL: Record<PaymentState, string> = {
  awaiting: 'Awaiting payment',
  matched: 'Paid',
  'not yet credited': 'Not yet credited',
  mismatch: 'Does not match',
  check: 'Check this',
}

function errorText(error: unknown): string {
  if (error instanceof NeedsConsent) {
    return 'This computer has no on-device model. Choose above whether to use the cloud instead.'
  }
  return error instanceof Error ? error.message : String(error)
}

function Badge(props: { source: Reading<unknown>['source']; ms: number }) {
  return (
    <p className="meta">
      <span className="badge" data-source={props.source}>
        {props.source}
      </span>{' '}
      {(props.ms / 1000).toFixed(1)} s
    </p>
  )
}

function DeviceStatus(props: { device: DeviceApi }) {
  const { device } = props
  const line =
    device.progress !== null
      ? `Downloading the on-device model: ${Math.round(device.progress * 100)}%`
      : {
          checking: 'Checking for the on-device model…',
          available: 'On-device model ready',
          downloadable:
            'The on-device model downloads the first time you use it.',
          downloading: 'The on-device model is downloading.',
          unavailable: 'This computer has no on-device model.',
        }[device.state]
  const ask =
    device.asking || (device.state === 'unavailable' && !device.consent)
  return (
    <div className="device">
      <p aria-live="polite">{line}</p>
      {device.consent && (
        <p>
          Cloud fallback is on.{' '}
          <button
            type="button"
            className="link"
            onClick={() => device.setConsent(false)}
          >
            Turn it off
          </button>
        </p>
      )}
      {ask && !device.consent && (
        <div className="consent" role="region" aria-label="Cloud consent">
          <p>
            Without the on-device model nothing can be read on this computer. If
            you agree, the receipt, chat text or draft details for each action
            you click will be sent to Google&apos;s Gemini service through
            Firebase. Your saved customers and orders stay on this computer
            either way, and you can turn this off at any time.
          </p>
          <button type="button" onClick={() => device.setConsent(true)}>
            Use the cloud for these actions
          </button>{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => device.setConsent(false)}
          >
            Not now
          </button>
        </div>
      )}
    </div>
  )
}

export function Panel(props: {
  chat: OpenChat | null
  verifyRequest: { messageId: string; nonce: number } | null
  ledger: LedgerApi
  device: DeviceApi
  host: PanelHost
}) {
  const { chat, ledger, device, host } = props
  const { data, config } = ledger
  const [work, setWork] = useState<Record<string, Work>>({})
  const patch = (phone: string, next: Partial<Work>) =>
    setWork((w) => ({ ...w, [phone]: { ...w[phone], ...next } }))

  const customerId = chat ? normalisePhone(chat.phone) : null
  const openOrder = (orders: Order[], id: string | null) =>
    orders.find((o) => o.customerId === id && o.delivery === 'pending') ?? null
  const order = data ? openOrder(data.orders, customerId) : null
  const current = chat ? (work[chat.phone] ?? {}) : {}

  async function verify(messageId?: string) {
    if (!chat) return
    const phone = chat.phone
    const message = messageId
      ? chat.messages.find((m) => m.id === messageId)
      : [...chat.messages].reverse().find((m) => m.image)
    if (!message?.image) return
    patch(phone, { verify: { status: 'running', note: 'Getting ready…' } })
    try {
      await device.ready()
      patch(phone, {
        verify: { status: 'running', note: 'Reading the receipt…' },
      })
      const reading = await readReceiptImage(message.image, device.consent)
      const receipt = toReceipt(reading.fields, config)
      const now = await ledger.load()
      const mine = openOrder(now.orders, normalisePhone(phone))
      const verdict = verifyReceipt(
        receipt,
        matcherLedger(now.orders, now.credits, config, mine?.id),
        config,
      )
      if (mine) {
        await ledger.saveOrder(
          recordVerdict(mine, receipt, verdict, Date.now()),
        )
      }
      patch(phone, {
        verify: { status: 'done', value: { reading, receipt, verdict } },
      })
    } catch (error) {
      patch(phone, { verify: { status: 'error', message: errorText(error) } })
    }
  }

  // The chat's own "Verify payment" button. Each click carries a new nonce,
  // and the ref stops development double-rendering from reading it twice.
  const request = props.verifyRequest
  const handled = useRef<number | null>(null)
  const onRequest = useEffectEvent(
    (messageId: string) => void verify(messageId),
  )
  useEffect(() => {
    if (!request || handled.current === request.nonce) return
    handled.current = request.nonce
    onRequest(request.messageId)
  }, [request])

  async function capture() {
    if (!chat) return
    const phone = chat.phone
    patch(phone, { capture: { status: 'running', note: 'Getting ready…' } })
    try {
      await device.ready()
      patch(phone, {
        capture: {
          status: 'running',
          note: 'Reading the order from the chat…',
        },
      })
      const lines = chat.messages.map((m) => ({
        from: m.from,
        time: m.time,
        text: m.text,
        image: Boolean(m.image),
      }))
      const reading = await readOrder(transcript(lines), device.consent)
      const f = toOrderFields(reading.fields)
      const form: OrderForm = {
        customerName: f.customerName || chat.contactName,
        address: f.address,
        landmark: f.landmark,
        area: f.area,
        amount: f.amountKobo === null ? '' : String(f.amountKobo / 100),
        items: f.items.map((i) => ({
          name: i.name,
          qty: String(i.qty),
          price: i.priceKobo === null ? '' : String(i.priceKobo / 100),
        })),
      }
      patch(phone, {
        capture: {
          status: 'done',
          value: { source: reading.source, ms: reading.ms, form },
        },
      })
    } catch (error) {
      patch(phone, { capture: { status: 'error', message: errorText(error) } })
    }
  }

  function editForm(next: Partial<OrderForm>) {
    if (!chat || current.capture?.status !== 'done') return
    const value = current.capture.value
    patch(chat.phone, {
      capture: {
        status: 'done',
        value: { ...value, form: { ...value.form, ...next } },
      },
    })
  }

  async function saveOrder(form: OrderForm) {
    if (!chat) return
    const data = await ledger.load()
    const at = Date.now()
    const id = normalisePhone(chat.phone)
    const items = form.items
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        qty: Math.max(1, Number.parseInt(i.qty, 10) || 1),
        priceKobo: parseNairaKobo(i.price),
      }))
    let fresh = newOrder(
      data.orders,
      {
        mode: 'everyday',
        customerId: id,
        items,
        amountKobo: parseNairaKobo(form.amount),
      },
      at,
    )
    const v = current.verify
    if (v?.status === 'done') {
      const verdict = verifyReceipt(
        v.value.receipt,
        matcherLedger(data.orders, data.credits, config, fresh.id),
        config,
      )
      fresh = recordVerdict(fresh, v.value.receipt, verdict, at)
    }
    await ledger.saveOrder(
      fresh,
      id
        ? {
            id,
            name: form.customerName.trim(),
            address: form.address.trim(),
            landmark: form.landmark.trim(),
            area: form.area.trim(),
            updatedAt: at,
          }
        : undefined,
    )
    patch(chat.phone, { capture: undefined })
  }

  async function pickCredit(creditId: string) {
    if (!chat) return
    const data = await ledger.load()
    const mine = openOrder(data.orders, customerId)
    if (!mine) return
    // Runs on a click, not during render; the rule mistakes the handler for
    // render code because it is wired up inside a list.
    // oxlint-disable-next-line react/purity
    const at = Date.now()
    const result = confirmCredit(
      mine,
      creditId,
      matcherLedger(data.orders, data.credits, config, mine.id),
      at,
    )
    if (result.ok) await ledger.saveOrder(result.order)
    patch(chat.phone, { notice: result.ok ? undefined : result.reason })
  }

  async function draft() {
    if (!chat || !data) return
    const phone = chat.phone
    patch(phone, { draft: { status: 'running', note: 'Getting ready…' } })
    try {
      await device.ready()
      patch(phone, { draft: { status: 'running', note: 'Writing a reply…' } })
      const v = current.verify?.status === 'done' ? current.verify.value : null
      const customer = data.customers.find((c) => c.id === customerId)
      const prompt = draftPrompt(
        {
          payment: order?.payment.state ?? v?.verdict.kind ?? null,
          amountKobo: order?.amountKobo ?? v?.receipt.amountKobo ?? null,
          items: order?.items ?? [],
          pickup: Boolean(customer && !customer.address),
        },
        transcript(
          chat.messages.map((m) => ({
            from: m.from,
            time: m.time,
            text: m.text,
            image: Boolean(m.image),
          })),
          2000,
        ),
      )
      const reading = await writeDraft(prompt, device.consent)
      const problem = draftProblem(reading.fields)
      if (problem) throw new Error(`${problem} Try again.`)
      host.insertDraft(phone, reading.fields)
      patch(phone, { draft: { status: 'done', value: reading } })
    } catch (error) {
      patch(phone, { draft: { status: 'error', message: errorText(error) } })
    }
  }

  const v = current.verify
  const c = current.capture
  const d = current.draft
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Not recognised'
  const hasReceipt = chat?.messages.some((m) => m.image) ?? false
  const customerName = (id: string | null) =>
    data?.customers.find((x) => x.id === id)?.name || 'Customer'
  const amountGap =
    v?.status === 'done' &&
    order?.amountKobo != null &&
    v.value.receipt.amountKobo !== null &&
    v.value.receipt.amountKobo !== order.amountKobo

  return (
    <aside className="panel" aria-label="Payment desk">
      <header>
        <h2>Payment desk</h2>
        <DeviceStatus device={device} />
      </header>

      {ledger.loadError && (
        <p className="error" role="alert">
          Couldn&apos;t open the records on this computer: {ledger.loadError}
        </p>
      )}

      {!chat ? (
        <p className="empty">
          Open a chat to verify a payment, capture the order or draft a reply.
        </p>
      ) : (
        <>
          <p className="who">
            <strong>{chat.contactName}</strong> {chat.phone}
          </p>

          <section className="card" aria-labelledby="pay-h">
            <h3 id="pay-h">Payment</h3>
            {!hasReceipt && (
              <p className="empty">No receipt in this chat yet.</p>
            )}
            {hasReceipt && v?.status !== 'running' && (
              <button type="button" onClick={() => void verify()}>
                {v ? 'Verify again' : 'Verify payment'}
              </button>
            )}
            {data?.credits.length === 0 && (
              <p className="hint">
                No bank alerts have been read yet, so nothing can match. Read
                your alerts from the inbox first.
              </p>
            )}
            {v?.status === 'running' && <p aria-live="polite">{v.note}</p>}
            {v?.status === 'error' && (
              <p className="error" role="alert">
                {v.message}
              </p>
            )}
            {v?.status === 'done' && (
              <>
                <Badge
                  source={v.value.reading.source}
                  ms={v.value.reading.ms}
                />
                <dl className="fields">
                  <dt>Amount</dt>
                  <dd>
                    {v.value.receipt.amountKobo === null
                      ? 'Not read'
                      : formatNaira(v.value.receipt.amountKobo)}
                  </dd>
                  <dt>Sender</dt>
                  <dd>{v.value.receipt.sender || 'Not read'}</dd>
                  <dt>Bank</dt>
                  <dd>{bankName(v.value.receipt.senderBank)}</dd>
                  <dt>Session ID</dt>
                  <dd className="mono">
                    {v.value.reading.fields.sessionId || 'Not printed'}
                  </dd>
                  <dt>Time</dt>
                  <dd>{v.value.reading.fields.dateTime || 'Not read'}</dd>
                </dl>
                <div className="verdict" data-kind={v.value.verdict.kind}>
                  <strong>{PAYMENT_LABEL[v.value.verdict.kind]}</strong>
                  <p>
                    {v.value.verdict.kind === 'matched'
                      ? v.value.verdict.notes.join(' ') ||
                        'The money is in your account.'
                      : v.value.verdict.reason}
                  </p>
                  {current.notice && (
                    <p className="error" role="alert">
                      {current.notice}
                    </p>
                  )}
                  {v.value.verdict.kind === 'check' &&
                    v.value.verdict.candidates.length > 0 &&
                    (order ? (
                      <ul className="candidates">
                        {v.value.verdict.candidates.map((id) => {
                          const cr = data?.credits.find((x) => x.id === id)
                          return (
                            <li key={id}>
                              {cr
                                ? `${formatNaira(cr.amountKobo)} from ${cr.sender}`
                                : id}{' '}
                              <button
                                type="button"
                                onClick={() => void pickCredit(id)}
                              >
                                This one
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="hint">
                        Save the order first, then choose the credit that pays
                        for it.
                      </p>
                    ))}
                </div>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="order-h">
            <h3 id="order-h">Order</h3>
            {order && (
              <div className="saved">
                <p>
                  <strong>Order {order.code}</strong>{' '}
                  {order.amountKobo === null
                    ? ''
                    : formatNaira(order.amountKobo)}{' '}
                  · {PAYMENT_LABEL[order.payment.state]}
                  {order.payment.decidedBy === 'vendor' &&
                    ' (confirmed by you)'}
                </p>
                <p>
                  {order.items.map((i) => `${i.qty} × ${i.name}`).join(', ') ||
                    'No items listed'}
                </p>
                {amountGap && v?.status === 'done' && (
                  <p className="hint">
                    The receipt shows{' '}
                    {formatNaira(v.value.receipt.amountKobo ?? 0)} but the order
                    total is {formatNaira(order.amountKobo ?? 0)}.
                  </p>
                )}
              </div>
            )}
            {!order && !c && (
              <button type="button" onClick={() => void capture()}>
                Capture order from chat
              </button>
            )}
            {c?.status === 'running' && <p aria-live="polite">{c.note}</p>}
            {c?.status === 'error' && (
              <>
                <p className="error" role="alert">
                  {c.message}
                </p>
                <button type="button" onClick={() => void capture()}>
                  Try again
                </button>
              </>
            )}
            {c?.status === 'done' && (
              <form
                className="order-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveOrder(c.value.form)
                }}
              >
                <Badge source={c.value.source} ms={c.value.ms} />
                <p className="hint">Check the details, then save.</p>
                {c.value.form.items.map((item, n) => (
                  <fieldset key={n} className="item">
                    <legend>Item {n + 1}</legend>
                    <label>
                      Item
                      <input
                        value={item.name}
                        onChange={(e) =>
                          editForm({
                            items: c.value.form.items.map((x, k) =>
                              k === n ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Qty
                      <input
                        inputMode="numeric"
                        value={item.qty}
                        onChange={(e) =>
                          editForm({
                            items: c.value.form.items.map((x, k) =>
                              k === n ? { ...x, qty: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Price (₦)
                      <input
                        inputMode="decimal"
                        value={item.price}
                        onChange={(e) =>
                          editForm({
                            items: c.value.form.items.map((x, k) =>
                              k === n ? { ...x, price: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="quiet"
                  onClick={() =>
                    editForm({
                      items: [
                        ...c.value.form.items,
                        { name: '', qty: '1', price: '' },
                      ],
                    })
                  }
                >
                  Add an item
                </button>
                {(
                  [
                    ['amount', 'Total (₦)'],
                    ['customerName', 'Customer name'],
                    ['address', 'Delivery address (empty for pickup)'],
                    ['landmark', 'Landmark'],
                    ['area', 'Area'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      value={c.value.form[key]}
                      onChange={(e) => editForm({ [key]: e.target.value })}
                    />
                  </label>
                ))}
                <button type="submit">Save order</button>{' '}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => patch(chat.phone, { capture: undefined })}
                >
                  Discard
                </button>
              </form>
            )}
          </section>

          <section className="card" aria-labelledby="draft-h">
            <h3 id="draft-h">Reply</h3>
            {d?.status !== 'running' && (
              <button type="button" onClick={() => void draft()}>
                {d?.status === 'done' ? 'Draft again' : 'Draft a reply'}
              </button>
            )}
            {d?.status === 'running' && <p aria-live="polite">{d.note}</p>}
            {d?.status === 'error' && (
              <p className="error" role="alert">
                {d.message}
              </p>
            )}
            {d?.status === 'done' && (
              <>
                <Badge source={d.value.source} ms={d.value.ms} />
                <p>
                  The draft is in the message box. It has not been sent; edit it
                  or send it yourself.
                </p>
              </>
            )}
          </section>
        </>
      )}

      <section className="card" aria-labelledby="today-h">
        <h3 id="today-h">Today&apos;s orders</h3>
        {!data && !ledger.loadError && <p>Loading…</p>}
        {data?.orders.length === 0 && (
          <p className="empty">No orders saved yet.</p>
        )}
        {data && data.orders.length > 0 && (
          <ul className="orders">
            {data.orders.map((o) => (
              <li key={o.id}>
                <span>
                  {o.code}. {customerName(o.customerId)}
                </span>
                <span>
                  {o.amountKobo === null ? '' : formatNaira(o.amountKobo)}
                </span>
                <span data-kind={o.payment.state}>
                  {PAYMENT_LABEL[o.payment.state]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="privacy">
          Customer names, phone numbers and addresses stay on this computer.
          Your books in the cloud hold only amounts and payment states.
          {ledger.books.state === 'syncing' && ' Updating your books…'}
          {ledger.books.state === 'synced' && ' Books up to date.'}
          {ledger.books.state === 'failed' &&
            ` Books not updated yet (${ledger.books.message}); orders are safe on this computer.`}
        </p>
      </section>
    </aside>
  )
}
