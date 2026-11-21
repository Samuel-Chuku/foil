import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { writeDraft } from '../ai/draft'
import { readOrder } from '../ai/order'
import { readRefundTo } from '../ai/refund'
import { toRefundTo } from '../capture/refundDetails'
import { rulesForDraft } from '../capture/shopRules'
import { followUpFacts, formatWait, waitingMin } from '../capture/followUp'
import { deliveryFacts, describePlan, planDelivery } from '../capture/delivery'
import { readReceiptImage } from '../ai/receipt'
import { readVoiceNote, voiceRequest } from '../ai/voice'
import {
  clarifyLine,
  LAGOS_STREETS,
  voiceLine,
  type VoiceNote,
} from '../capture/voice'
import { placeNames } from '../capture/places'
import { errorMessage } from '../cloud/errors'
import { cloudErrorText } from '../cloud/send'
import { useApproval } from './useApproval'
import { VoiceCard, type VoiceStep } from './VoiceCard'
import type { Reading } from '../ai/run'
import { draftPrompt, draftProblem } from '../capture/draft'
import { toOrderFields } from '../capture/orderFields'
import {
  askedFor,
  called,
  leftOf,
  productOf,
  stockFacts,
  withListPrices,
} from '../capture/stock'
import { transcript } from '../capture/transcript'
import { appConfig } from '../config/active'
import {
  applyVerdict,
  balanceKobo,
  confirmCredit,
  customerKey,
  dueKobo,
  matcherLedger,
  newOrder,
  normalisePhone,
  paidKobo,
  undoCreditPick,
} from '../ledger/ledger'
import { extraMoney, moreFromPayer, type ExtraRow } from '../ledger/settle'
import type {
  Order,
  PaymentState,
  RefundTo,
  Settlement,
  OrderItem,
} from '../ledger/types'
import { verifyReceipt, type Verdict } from '../verify/match'
import { formatNaira, parseNairaKobo } from '../verify/money'
import type { RawReceipt } from '../verify/receiptFields'
import { toReceipt } from '../verify/receiptFields'
import type { Credit, Receipt } from '../verify/types'
import type { OpenChat, PanelHost, PanelRequest } from './host'
import {
  fileToImage,
  importBankApp,
  lagosToday,
  type BankAppResult,
} from './bankApp'
import { DeliveryFields } from './DeliveryFields'
import {
  fromDeliveryForm,
  toDeliveryForm,
  type DeliveryForm,
} from './deliveryForm'
import { ExtraMoney } from './ExtraMoney'
import { ShopRulesCard } from './ShopRulesCard'
import { StockCard } from './StockCard'
import { QueueCard } from './QueueCard'
import { useOnline } from './useOnline'
import { DropCard } from './DropCard'
import { pictureItems } from './pictureItems'
import { pickPhoto } from '../ai/photoPick'
import {
  DEFAULT_HOLD_MIN,
  dropFacts,
  itemState,
  messageTime,
  roleOf,
  unclaimedFacts,
} from '../capture/drop'
import { lagosFromEpoch } from '../verify/time'
import { MoneyFlowCard } from './MoneyFlowCard'
import { BooksCard } from './BooksCard'
import { ReceiptCard } from './ReceiptCard'
import { ReceiptLookCard } from './ReceiptLookCard'
import { useBrand } from './useBrand'
import { PanelTabs, TabPanel, type TabId } from './PanelTabs'
import { receiptFor } from '../capture/customerReceipt'
import { TrendsCard } from './TrendsCard'
import type { ShopRulesApi } from './useShopRules'
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
  checkedAt: number
}

type OrderForm = {
  delivery: DeliveryForm
  customerName: string
  address: string
  landmark: string
  area: string
  amount: string
  items: {
    name: string
    qty: string
    price: string
    // The stock item, when matched by photo or picked by the vendor.
    productId?: string
    // Stock photos close to the customer's picture, for the vendor to pick.
    choices?: string[]
    // Where the pre-selected pick came from, when the model broke a tie.
    pickedBy?: Reading<unknown>['source']
  }[]
  // When the customer asked for a drop item: their place in line.
  claimedAt?: number
}

type Work = {
  verify?: Step<Verified>
  capture?: Step<{
    source: Reading<unknown>['source']
    ms: number
    form: OrderForm
  }>
  draft?: Step<Reading<string>>
  voice?: VoiceStep
  // What each voice note said, by message id, for the reply draft.
  heard?: Record<string, VoiceNote>
  // Every receipt read in this chat, by message id, so saving an order can
  // apply them all in order: a first payment, then its balance.
  receipts?: Record<string, Receipt>
  // A change to a saved order's delivery, until it is saved.
  deliveryEdit?: DeliveryForm
  // The refund account read from the chat, for the vendor to check and save.
  refund?: Step<{
    key: string
    source: Reading<unknown>['source']
    ms: number
    form: RefundTo
  }> & { key: string }
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

// The state label, sharpened by what has actually arrived against the total.
function paymentText(order: Order, credits: Credit[]): string {
  const balance = balanceKobo(order, credits)
  if (
    balance !== null &&
    balance > 0 &&
    order.amountKobo !== null &&
    paidKobo(order, credits) >= order.amountKobo
  ) {
    return `Items paid, delivery ${formatNaira(balance)} to pay`
  }
  if (balance !== null && balance > 0) return `Short by ${formatNaira(balance)}`
  if (balance !== null && balance < 0) {
    return `Paid, ${formatNaira(-balance)} over`
  }
  return PAYMENT_LABEL[order.payment.state]
}

function errorText(error: unknown): string {
  if (error instanceof NeedsConsent) {
    return `${error.message} Choose above how to go on.`
  }
  return errorMessage(error, navigator.onLine)
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
          available:
            device.warm === 'warming'
              ? 'Loading the on-device model so your first click is quick…'
              : 'On-device model ready',
          downloadable:
            'The on-device model downloads the first time you use it.',
          downloading: 'The on-device model is downloading.',
          unavailable: 'This computer has no on-device model.',
        }[device.state]
  const ask =
    device.asking || (device.state === 'unavailable' && !device.consent)
  const canDownload = device.state === 'downloadable'
  return (
    <div className="device">
      <p aria-live="polite">{line}</p>
      {device.waiting > 0 && (
        <p className="hint" aria-live="polite">
          {device.waiting} more {device.waiting === 1 ? 'step' : 'steps'}{' '}
          waiting for the model; they run one at a time.
        </p>
      )}
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
      {ask && !device.consent && device.progress === null && (
        <div className="consent" role="region" aria-label="Cloud consent">
          {canDownload && (
            <p>
              Chrome can download its on-device model once. It is a large
              download that takes a while, and afterwards receipts, orders and
              drafts are read privately on this computer, even offline.
            </p>
          )}
          <p>
            {canDownload
              ? 'Or use the cloud now: '
              : 'Without the on-device model nothing can be read on this computer. If you agree, '}
            the receipt, chat text or draft details for each action you click
            will be sent to Google&apos;s Gemini service through Firebase. Your
            saved customers and orders stay on this computer either way, and you
            can turn this off at any time.
          </p>
          {canDownload && (
            <>
              <button type="button" onClick={() => void device.download()}>
                Download the on-device model
              </button>{' '}
            </>
          )}
          <button
            type="button"
            className={canDownload ? 'quiet' : undefined}
            onClick={() => device.setConsent(true)}
          >
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
  request: PanelRequest | null
  ledger: LedgerApi
  device: DeviceApi
  host: PanelHost
  shop: ShopRulesApi
  // Where alerts come from in this host: the extension's Gmail accounts.
  inbox?: ReactNode
}) {
  const { chat, ledger, device, host, shop } = props
  const online = useOnline()
  const approval = useApproval()
  const brand = useBrand()
  const [tab, setTab] = useState<TabId>('chat')
  // A click in WhatsApp, or opening another chat, brings the chat's tab
  // forward.
  const openPhone = props.chat?.phone ?? null
  const [shownFor, setShownFor] = useState({
    phone: openPhone,
    request: props.request,
  })
  if (shownFor.phone !== openPhone || shownFor.request !== props.request) {
    setShownFor({ phone: openPhone, request: props.request })
    if (
      (openPhone && shownFor.phone !== openPhone) ||
      (props.request && shownFor.request !== props.request)
    ) {
      setTab('chat')
    }
  }
  const { data, config } = ledger
  const [work, setWork] = useState<Record<string, Work>>({})
  const [appBank, setAppBank] = useState('')
  const [bankApp, setBankApp] = useState<Step<BankAppResult> | null>(null)
  const patch = (phone: string, next: Partial<Work>) =>
    setWork((w) => ({ ...w, [phone]: { ...w[phone], ...next } }))

  const customerId = chat ? customerKey(chat.phone) : null
  const hasReceipt = chat?.messages.some((m) => m.image) ?? false
  const openOrder = (orders: Order[], id: string | null) =>
    orders.find((o) => o.customerId === id && o.delivery === 'pending') ?? null
  const order = data ? openOrder(data.orders, customerId) : null

  // Each read of a chat is noted for the waiting queue, on this device.
  const { noteChat } = ledger
  const messages = chat?.messages
  const contactName = chat?.contactName ?? ''
  useEffect(() => {
    if (!messages?.length || !customerId) return
    void noteChat(customerId, contactName, messages)
  }, [messages, customerId, contactName, noteChat])
  const current = chat ? (work[chat.phone] ?? {}) : {}
  // Lagos is a fixed hour ahead of UTC.
  const LAGOS_OFFSET_MS = 3_600_000
  // Holds run on the real clock; the demo shows its own sample-day clock, so
  // times are shifted by the difference for display and for message times.
  const clockShift = () => host.now() - lagosFromEpoch(Date.now())
  // An order's Lagos day and hour, on the same shifted clock.
  const lagos = {
    day: (o: Order) =>
      new Date(lagosFromEpoch(o.createdAt) + clockShift())
        .toISOString()
        .slice(0, 10),
    hour: (o: Order) =>
      new Date(lagosFromEpoch(o.createdAt) + clockShift()).getUTCHours(),
  }
  const today = new Date(host.now()).toISOString().slice(0, 10)
  const todays = data?.orders.filter((o) => lagos.day(o) === today) ?? []
  const clock = (ms: number) =>
    new Date(lagosFromEpoch(ms) + clockShift()).toISOString().slice(11, 16)

  // Money that pays no order: the open list for the whole day, and the part
  // that belongs with this chat (this order's overpayment, the customer's own
  // decided extras, and any undecided payment from whoever paid their order).
  const extraRows = data
    ? extraMoney(data.orders, data.credits, data.settlements, config)
    : []
  // Money waiting for the vendor's decision, shown on the Money tab.
  const undecided = extraRows.filter((r) => !r.settlement).length
  const paidWith =
    order?.payment.state === 'matched'
      ? (data?.credits.find((x) => x.id === order.payment.creditId) ?? null)
      : null
  const payerExtra = new Set(
    paidWith && data
      ? moreFromPayer(
          paidWith,
          matcherLedger(
            data.orders,
            data.credits,
            config,
            undefined,
            data.settlements,
          ),
          config,
        ).map((x) => x.id)
      : [],
  )
  const chatRows = extraRows.filter((r) =>
    r.settlement
      ? r.settlement.customerId === customerId
      : (order !== null && r.orderCode === order.code) ||
        (r.orderCode === null && payerExtra.has(r.credit.id)),
  )
  const balance = order && data ? balanceKobo(order, data.credits) : null
  const settle = (row: ExtraRow, state: Settlement['state']) =>
    void ledger.settleCredit(row, state, customerId)

  // The chat with its messages. When the panel knows only which chat is
  // open, the click that needs it reads it now.
  async function readOpenChat(): Promise<OpenChat | null> {
    if (!props.chat || props.chat.messages.length > 0) return props.chat
    return (await host.readChat?.()) ?? props.chat
  }

  async function verify(messageId?: string, given?: OpenChat) {
    const chat = given ?? (await readOpenChat())
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
        matcherLedger(
          now.orders,
          now.credits,
          config,
          mine?.id,
          now.settlements,
        ),
        config,
      )
      const next =
        mine && applyVerdict(mine, receipt, verdict, now.credits, Date.now())
      if (next) await ledger.saveOrder(next)
      setWork((w) => ({
        ...w,
        [phone]: {
          ...w[phone],
          receipts: { ...w[phone]?.receipts, [message.id]: receipt },
        },
      }))
      patch(phone, {
        verify: {
          status: 'done',
          value: { reading, receipt, verdict, checkedAt: Date.now() },
        },
      })
    } catch (error) {
      patch(phone, { verify: { status: 'error', message: errorText(error) } })
    }
  }

  // The chat's own "Verify payment" and "Capture order" buttons. The ref
  // stops development double-rendering from running a click twice.
  const request = props.request
  const handled = useRef<number | null>(null)
  const onRequest = useEffectEvent((r: PanelRequest) =>
    r.action === 'verify'
      ? void verify(r.messageId)
      : r.action === 'voice'
        ? void readVoice(r.messageId)
        : void capture(),
  )
  useEffect(() => {
    if (!request || handled.current === request.nonce) return
    handled.current = request.nonce
    onRequest(request)
  }, [request])

  async function capture() {
    const chat = await readOpenChat()
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
        // A status reply's words ("I want this") mean the item in the status.
        text: m.quoted?.status
          ? `(replying to the shop's status) ${m.text ?? ''}`
          : m.text,
        image: Boolean(m.image),
        voice: Boolean(m.voice),
      }))
      const chatText = transcript(lines)
      const products = ledger.data?.products ?? []
      // Pictures first: matching is quick and needs no model.
      const pictures = await pictureItems(
        chat.messages,
        products,
        appConfig().photoMatch,
      )
      // A close call between stock photos goes to the model, which looks at
      // the customer's picture beside the two or three nearest photos.
      const picks = new Map<
        string,
        { productId: string; source: Reading<unknown>['source'] }
      >()
      for (const p of pictures.items) {
        if (p.kind !== 'unsure') continue
        const photos = p.candidates.flatMap((c) =>
          c.photo
            ? [
                {
                  mimeType: 'image/jpeg',
                  base64: c.photo.thumb.split(',')[1] ?? '',
                },
              ]
            : [],
        )
        if (photos.length < 2) continue
        patch(phone, {
          capture: {
            status: 'running',
            note: 'Comparing their picture with your closest photos…',
          },
        })
        const pick = await pickPhoto(p.picture, photos, device.consent)
        const chosen =
          pick.fields === null ? undefined : p.candidates[pick.fields]
        if (chosen) {
          picks.set(p.messageId, { productId: chosen.id, source: pick.source })
        }
      }
      patch(phone, {
        capture: {
          status: 'running',
          note: 'Reading the order from the chat…',
        },
      })
      const reading = await readOrder(chatText, device.consent)
      const f = toOrderFields(reading.fields)
      const shown = new Set(
        pictures.items.flatMap((p) =>
          p.kind === 'sure' ? [p.product.id] : [],
        ),
      )
      // A drop claim's place in line is when the customer asked.
      const claimMessage = pictures.items.find(
        (p) => p.kind === 'sure' && p.product.dropId,
      )?.messageId
      const asked = chat.messages.find((m) => m.id === claimMessage)?.time
      const askedLagos = asked ? messageTime(asked, host.now()) : null
      const claimedAt =
        askedLagos === null
          ? undefined
          : askedLagos - LAGOS_OFFSET_MS - clockShift()
      // Several replies about the same piece are one request for it.
      const seenPieces = new Set<string>()
      const onePerPiece = pictures.items.filter((p) => {
        if (p.kind !== 'sure') return true
        if (seenPieces.has(p.product.id)) return false
        seenPieces.add(p.product.id)
        return true
      })
      const fromPictures = onePerPiece.map((p) =>
        p.kind === 'sure'
          ? {
              name: p.product.name || 'Item from photo',
              qty: 1,
              priceKobo: p.product.priceKobo,
              productId: p.product.id,
            }
          : (() => {
              const pick = picks.get(p.messageId)
              const chosen = p.candidates.find((c) => c.id === pick?.productId)
              return {
                name: chosen ? chosen.name || 'Item from photo' : '',
                qty: 1,
                priceKobo: chosen?.priceKobo ?? null,
                choices: p.candidates.map((c) => c.id),
                ...(chosen &&
                  pick && {
                    productId: chosen.id,
                    pickedBy: pick.source,
                  }),
              }
            })(),
      )
      // A named line the photo already covers is not counted twice.
      const named = f.items.filter((i) => {
        const p = productOf(i, products)
        return !p || !shown.has(p.id)
      })
      const items = [
        ...fromPictures,
        ...withListPrices(named, products),
      ] as (OrderItem & {
        choices?: string[]
        pickedBy?: Reading<unknown>['source']
      })[]
      const listTotal = items.every((i) => i.priceKobo !== null)
        ? items.reduce((n, i) => n + i.qty * (i.priceKobo ?? 0), 0)
        : null
      const amountKobo = f.amountKobo ?? (listTotal || null)
      const form: OrderForm = {
        ...(claimedAt !== undefined && { claimedAt }),
        delivery: toDeliveryForm(planDelivery(f, shop.rules, chatText)),
        customerName: f.customerName || chat.contactName,
        address: f.address,
        landmark: f.landmark,
        area: f.area,
        amount: amountKobo === null ? '' : String(amountKobo / 100),
        items: items.map((i) => ({
          name: i.name,
          qty: String(i.qty),
          price: i.priceKobo === null ? '' : String(i.priceKobo / 100),
          ...(i.productId && { productId: i.productId }),
          ...(i.choices && { choices: i.choices }),
          ...(i.pickedBy && { pickedBy: i.pickedBy }),
        })),
      }
      patch(phone, {
        capture: {
          status: 'done',
          value: { source: reading.source, ms: reading.ms, form },
        },
      })
      // Capturing is the vendor's go-ahead to read this chat, so its receipts
      // are checked too, oldest first, while they look over the order.
      // A photo of an item is not a receipt.
      for (const m of chat.messages) {
        if (pictures.productImages.has(m.id)) continue
        if (m.image && !current.receipts?.[m.id]) await verify(m.id, chat)
      }
    } catch (error) {
      patch(phone, { capture: { status: 'error', message: errorText(error) } })
    }
  }

  // A voice note is heard in the cloud, and only after the vendor has seen
  // and approved exactly what goes: the shop's own vocabulary and the note.
  async function readVoice(messageId: string) {
    const chat = props.chat
    const message = chat?.messages.find((m) => m.id === messageId)
    const audio = message?.voice?.audio
    if (!chat || !message?.voice || !audio) return
    const phone = chat.phone
    if (!online) {
      patch(phone, {
        voice: {
          status: 'error',
          message: 'You are offline. Nothing was sent.',
        },
      })
      return
    }
    patch(phone, {
      voice: { status: 'running', note: 'Waiting for your approval…' },
    })
    const approved = await approval.ask(
      voiceRequest(
        {
          ...audio,
          ...(message.voice.seconds !== null && {
            seconds: message.voice.seconds,
          }),
        },
        {
          glossary: appConfig().pidginGlossary,
          areas: placeNames('Lagos'),
          streets: LAGOS_STREETS,
          products: (data?.products ?? []).flatMap((p) =>
            p.name && !p.dropId ? [p.name] : [],
          ),
        },
      ),
    )
    if (!approved) {
      patch(phone, { voice: undefined })
      return
    }
    patch(phone, {
      voice: { status: 'running', note: 'Listening in the cloud…' },
    })
    try {
      const value = await readVoiceNote(approved)
      setWork((w) => ({
        ...w,
        [phone]: {
          ...w[phone],
          voice: { status: 'done', value, used: false },
          heard: { ...w[phone]?.heard, [messageId]: value.fields },
        },
      }))
    } catch (error) {
      patch(phone, {
        voice: {
          status: 'error',
          message: cloudErrorText(error),
        },
      })
    }
  }

  // Puts what the voice note said into the order form: new items and empty
  // fields only, so nothing the vendor or the chat already gave is replaced.
  function applyVoice() {
    if (!chat || current.voice?.status !== 'done') return
    const note = current.voice.value.fields
    const f = toOrderFields(note.order)
    const products = data?.products ?? []
    const heard = withListPrices(f.items, products).map((i) => ({
      name: i.name,
      qty: String(i.qty),
      price: i.priceKobo === null ? '' : String(i.priceKobo / 100),
      ...(i.productId && { productId: i.productId }),
    }))
    const base: OrderForm =
      current.capture?.status === 'done'
        ? current.capture.value.form
        : {
            delivery: toDeliveryForm(null),
            customerName: '',
            address: '',
            landmark: '',
            area: '',
            amount: '',
            items: [],
          }
    const known = new Set(base.items.map((i) => i.name.trim().toLowerCase()))
    const items = [
      ...base.items,
      ...heard.filter((i) => !known.has(i.name.trim().toLowerCase())),
    ]
    const sum = items.every((i) => i.price)
      ? items.reduce((n, i) => n + Number(i.qty) * Number(i.price), 0)
      : 0
    // The note itself is the source here, so the places it names count.
    const plan = planDelivery(
      f,
      shop.rules,
      [note.gloss, f.state, f.park, f.area, f.address].join('\n'),
    )
    const form: OrderForm = {
      ...base,
      // The name they say is theirs beats the name saved for the contact.
      customerName:
        f.customerName && base.customerName === chat.contactName
          ? f.customerName
          : base.customerName || f.customerName || chat.contactName,
      address: base.address || f.address,
      landmark: base.landmark || f.landmark,
      area: base.area || f.area,
      amount: base.amount || (sum ? String(sum) : ''),
      delivery: base.delivery.method ? base.delivery : toDeliveryForm(plan),
      items,
    }
    patch(chat.phone, {
      capture: {
        status: 'done',
        value:
          current.capture?.status === 'done'
            ? { ...current.capture.value, form }
            : { source: 'Cloud', ms: current.voice.value.ms, form },
      },
      voice: { ...current.voice, used: true },
    })
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
    const id = customerKey(chat.phone)
    const items = form.items
      .filter((i) => i.name.trim() || i.productId)
      .map((i) => ({
        name: i.name.trim() || 'Item from photo',
        qty: Math.max(1, Number.parseInt(i.qty, 10) || 1),
        priceKobo: parseNairaKobo(i.price),
        ...(i.productId && { productId: i.productId }),
      }))
    const drop = items.some(
      (i) => data.products.find((p) => p.id === i.productId)?.dropId,
    )
    let fresh = newOrder(
      data.orders,
      {
        mode: drop ? 'drop' : 'everyday',
        customerId: id,
        items,
        amountKobo: parseNairaKobo(form.amount),
        deliveryPlan: fromDeliveryForm(form.delivery),
      },
      at,
    )
    if (drop && form.claimedAt !== undefined) {
      fresh = { ...fresh, claimedAt: form.claimedAt }
    }
    // Receipts in chat order: a later one can pay the balance of an earlier.
    for (const m of chat.messages) {
      const receipt = current.receipts?.[m.id]
      if (!receipt) continue
      const verdict = verifyReceipt(
        receipt,
        matcherLedger(
          data.orders,
          data.credits,
          config,
          fresh.id,
          data.settlements,
        ),
        config,
      )
      fresh = applyVerdict(fresh, receipt, verdict, data.credits, at) ?? fresh
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
      matcherLedger(
        data.orders,
        data.credits,
        config,
        mine.id,
        data.settlements,
      ),
      at,
    )
    if (!result.ok) {
      patch(chat.phone, { notice: result.reason })
      return
    }
    await ledger.saveOrder(result.order)
    patch(chat.phone, { notice: undefined })
  }

  async function undoPick() {
    if (!chat) return
    const data = await ledger.load()
    const mine = openOrder(data.orders, customerId)
    // Runs on a click, not during render (see pickCredit).
    // oxlint-disable-next-line react/purity
    const at = Date.now()
    const undone = mine && undoCreditPick(mine, at)
    if (!undone) return
    await ledger.saveOrder(undone)
    patch(chat.phone, { notice: undefined })
  }

  async function saveDelivery() {
    if (!chat || !order || !current.deliveryEdit) return
    // Runs on a click, not during render (see pickCredit).
    // oxlint-disable-next-line react/purity
    const at = Date.now()
    await ledger.saveOrder({
      ...order,
      deliveryPlan: fromDeliveryForm(current.deliveryEdit),
      updatedAt: at,
    })
    patch(chat.phone, { deliveryEdit: undefined })
  }

  async function readBankAppFile(file: File) {
    setBankApp({ status: 'running', note: 'Reading the screenshot…' })
    try {
      const value = await importBankApp(
        await fileToImage(file),
        { bank: appBank || null, day: lagosToday(Date.now()) },
        device,
        ledger,
      )
      setBankApp({ status: 'done', value })
    } catch (error) {
      setBankApp({ status: 'error', message: errorText(error) })
    }
  }

  async function readRefund(key: string) {
    if (!chat) return
    const phone = chat.phone
    patch(phone, {
      refund: { key, status: 'running', note: 'Reading the chat…' },
    })
    try {
      await device.ready()
      const reading = await readRefundTo(
        transcript(
          chat.messages.map((m) => ({
            from: m.from,
            time: m.time,
            text: m.text,
            image: Boolean(m.image),
            voice: Boolean(m.voice),
          })),
        ),
        device.consent,
      )
      patch(phone, {
        refund: {
          key,
          status: 'done',
          value: {
            key,
            source: reading.source,
            ms: reading.ms,
            form: toRefundTo(reading.fields, config),
          },
        },
      })
    } catch (error) {
      patch(phone, {
        refund: { key, status: 'error', message: errorText(error) },
      })
    }
  }

  function editRefund(form: RefundTo) {
    const r = current.refund
    if (!chat || r?.status !== 'done') return
    patch(chat.phone, {
      refund: { ...r, value: { ...r.value, form } },
    })
  }

  // Under a refund owed in this chat: read the account from the chat, let the
  // vendor check it, then keep it with the refund on this computer.
  function refundControls(row: ExtraRow) {
    if (row.settlement?.state !== 'refund owed' || !chat) return null
    const r = current.refund?.key === row.key ? current.refund : undefined
    if (r?.status === 'running') return <p aria-live="polite">{r.note}</p>
    if (r?.status === 'done') {
      const form = r.value.form
      return (
        <form
          className="order-form"
          onSubmit={(e) => {
            e.preventDefault()
            void ledger
              .setRefundTo(row.key, form)
              .then(() => patch(chat.phone, { refund: undefined }))
          }}
        >
          <Badge source={r.value.source} ms={r.value.ms} />
          <p className="hint">
            Check these against the chat before you send any money.
          </p>
          {(
            [
              ['accountNumber', 'Account number'],
              ['bank', 'Bank'],
              ['accountName', 'Account name'],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                value={form[k]}
                inputMode={k === 'accountNumber' ? 'numeric' : undefined}
                onChange={(e) => editRefund({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          <button type="submit">Save account</button>{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => patch(chat.phone, { refund: undefined })}
          >
            Discard
          </button>
        </form>
      )
    }
    return (
      <>
        {r?.status === 'error' && (
          <p className="error" role="alert">
            {r.message}
          </p>
        )}
        <button
          type="button"
          className="quiet"
          disabled={device.busy}
          onClick={() => void readRefund(row.key)}
        >
          {row.settlement.refundTo
            ? 'Read the account again'
            : 'Read refund account from chat'}
        </button>
      </>
    )
  }

  async function draft() {
    const chat = await readOpenChat()
    if (!chat || !data) return
    const phone = chat.phone
    patch(phone, { draft: { status: 'running', note: 'Getting ready…' } })
    try {
      await device.ready()
      patch(phone, { draft: { status: 'running', note: 'Writing a reply…' } })
      const v = current.verify?.status === 'done' ? current.verify.value : null
      const chatText = transcript(
        chat.messages.map((m) => {
          // A voice note already heard reads as what it said, in English.
          const heard = current.heard?.[m.id]
          return {
            from: m.from,
            time: m.time,
            text: m.text ?? (heard ? voiceLine(heard) : undefined),
            image: Boolean(m.image),
            voice: Boolean(m.voice),
          }
        }),
        2000,
      )
      // What they asked about: the order's lines, or before there is an
      // order, the items they showed by picture and the ones they named.
      const said = chat.messages
        .filter((m) => m.from === 'customer' && m.text)
        .map((m) => m.text)
        .join('\n')
      const shownItems = order
        ? []
        : (
            await pictureItems(
              chat.messages,
              data.products,
              appConfig().photoMatch,
            )
          ).items.flatMap((p) =>
            p.kind === 'sure'
              ? [
                  {
                    name: p.product.name,
                    qty: 1,
                    priceKobo: p.product.priceKobo,
                    productId: p.product.id,
                  },
                ]
              : [],
          )
      const asked = [
        ...askedFor(order?.items ?? shownItems, '', data.products),
        ...(order ? [] : askedFor([], said, data.products)),
      ].filter(
        (a, i, all) =>
          all.findIndex((b) => b.product.id === a.product.id) === i,
      )
      // Drop items follow the hold and the line, not the stock count.
      const holdOf = (dropId: string | undefined) =>
        data.drops.find((x) => x.id === dropId)?.holdMin ?? DEFAULT_HOLD_MIN
      // A customer who is not getting the item, or whose money waits on
      // someone else's hold, is not told "payment received, order confirmed"
      // or quoted a price; the drop fact says what is happening instead.
      let outOfLine = false
      const dropLines = asked
        .filter((a) => a.product.dropId)
        .flatMap(({ product }) => {
          const hold = holdOf(product.dropId)
          const at = Date.now()
          const st = itemState(product, data.orders, hold, at)
          // Other pieces from the same drop that nobody holds.
          const others = data.products
            .filter((p) => p.dropId === product.dropId && p.id !== product.id)
            .filter(
              (p) => itemState(p, data.orders, hold, at).state === 'available',
            )
            .slice(0, 3)
            .map(
              (p) =>
                `#${p.dropNo}${p.priceKobo === null ? '' : ` (${formatNaira(p.priceKobo)})`}`,
            )
          const role = order ? roleOf(st, order.id) : null
          const price =
            product.priceKobo === null ? null : formatNaira(product.priceKobo)
          const it = `About ${called(product)}:`
          if (role?.role === 'bought' && !role.late) return []
          if (
            role &&
            ['released', 'lost', 'paidWaiting', 'refund'].includes(role.role)
          ) {
            outOfLine = true
          }
          return [
            role
              ? `${it} ${dropFacts('it', role, price, at, others)}`
              : `${it} ${unclaimedFacts('it', st, price, hold, others)}`,
          ]
        })
      const prompt = draftPrompt(
        {
          payment: outOfLine
            ? null
            : (order?.payment.state ?? v?.verdict.kind ?? null),
          // A transfer still being confirmed is spoken of by its own amount;
          // the order's total, delivery included, once it is paid or asked for.
          amountKobo: outOfLine
            ? null
            : order?.receipt && order.payment.state !== 'matched'
              ? order.receipt.amountKobo
              : ((order && dueKobo(order)) ?? v?.receipt.amountKobo ?? null),
          items: order?.items ?? [],
          // Before any payment only: once they have paid, stock is the
          // vendor's matter, not news for the customer.
          stock: [
            ...dropLines,
            ...(!order || order.payment.state === 'awaiting'
              ? stockFacts(
                  asked.filter((a) => !a.product.dropId),
                  data.products,
                  (p) => leftOf(p, data.orders, data.products, order?.id),
                )
              : []),
          ],
          followUp: [
            ...(current.voice?.status === 'done'
              ? [clarifyLine(current.voice.value.fields)].filter(
                  (l): l is string => l !== null,
                )
              : []),
            ...(order
              ? followUpFacts(
                  order,
                  host.now(),
                  shop.rules.paymentWaitMin,
                  config,
                  [
                    ...new Set(
                      data.credits.flatMap((c) => (c.bank ? [c.bank] : [])),
                    ),
                  ],
                )
              : []),
          ],
          delivery: deliveryFacts(
            order?.deliveryPlan ?? null,
            shop.rules,
            order?.amountKobo ?? null,
          ),
          extra: extraRows
            .filter((r) => r.settlement?.customerId === customerId)
            .map((r) => ({
              state: r.settlement!.state,
              amountKobo: r.amountKobo,
              hasAccount: Boolean(r.settlement!.refundTo?.accountNumber),
            })),
          shortKobo: balance !== null && balance > 0 ? balance : null,
          deliveryOwed:
            !!order &&
            order.amountKobo !== null &&
            balance !== null &&
            balance > 0 &&
            paidKobo(order, data.credits) >= order.amountKobo,
          rules: rulesForDraft(shop.rules, chatText),
          complaint:
            data.chats.find((x) => x.id === customerId)?.label === 'complaint',
        },
        chatText,
      )
      const reading = await writeDraft(prompt, device.consent)
      const problem = draftProblem(reading.fields)
      if (problem) throw new Error(`${problem} Try again.`)
      await host.insertDraft(phone, reading.fields)
      if (order) ledger.seen(order.id)
      patch(phone, { draft: { status: 'done', value: reading } })
    } catch (error) {
      patch(phone, { draft: { status: 'error', message: errorText(error) } })
    }
  }

  // What the shop's stock says about an item while the vendor checks an
  // order, so a sold-out item is caught before it is confirmed.
  function stockNote(p: { name: string; qty: string; productId?: string }) {
    const products = data?.products ?? []
    const product = productOf(p, products)
    if (products.length === 0 || (!p.name.trim() && !p.productId)) return null
    if (!product) return <p className="hint">Not on your stock list.</p>
    const left = leftOf(product, data?.orders ?? [], products)
    if (left === null)
      return <p className="hint">{product.name || 'On your stock list'}</p>
    const want = Math.max(1, Number.parseInt(p.qty, 10) || 1)
    return (
      <p className={left < want ? 'error' : 'hint'}>
        {product.name || 'This item'}: {left <= 0 ? 'sold out' : `${left} left`}
        {left > 0 && left < want && `, fewer than ${want}`}
      </p>
    )
  }

  const v = current.verify
  const c = current.capture
  const d = current.draft
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Not recognised'
  const receipt =
    order && data
      ? receiptFor(
          order,
          data.credits,
          shop.rules.shopName,
          data.customers.find((x) => x.id === order.customerId)?.name ?? null,
        )
      : null
  const customerName = (id: string | null) =>
    data?.customers.find((x) => x.id === id)?.name || 'Customer'
  // The order's own payment wins once it is newer than the receipt read in
  // this chat: the rules re-check orders when money arrives, and the vendor
  // may have picked a credit since.
  const fromOrder =
    order?.receipt &&
    order.payment.checkedAt !== null &&
    (v?.status !== 'done' || order.payment.checkedAt > v.value.checkedAt)
  const shown: {
    kind: Verdict['kind']
    text: string
    candidates: string[]
  } | null =
    fromOrder && order.payment.state !== 'awaiting'
      ? {
          kind: order.payment.state,
          text:
            order.payment.reason ??
            (order.payment.state === 'matched'
              ? 'The money is in your account.'
              : ''),
          candidates:
            order.payment.state === 'check' ? order.payment.candidates : [],
        }
      : v?.status === 'done'
        ? {
            kind: v.value.verdict.kind,
            text:
              v.value.verdict.kind === 'matched'
                ? v.value.verdict.notes.join(' ') ||
                  'The money is in your account.'
                : v.value.verdict.reason,
            candidates:
              v.value.verdict.kind === 'check'
                ? v.value.verdict.candidates
                : [],
          }
        : null
  // A shop that ticks no delivery option sells without delivery, so orders
  // carry no delivery line at all.
  const offersDelivery = shop.rules.methods.length > 0
  // How long this customer has waited on money that has not landed.
  const waited = order ? waitingMin(order, host.now()) : null
  const canRecheck =
    order?.receipt != null &&
    (order.payment.state === 'not yet credited' ||
      (order.payment.state === 'check' && order.payment.decidedBy !== 'vendor'))
  const paidWhileAway = order !== null && ledger.justPaid.includes(order.id)

  // Before a payment is confirmed, flag a receipt that does not cover the order.
  const amountGap =
    balance === null &&
    v?.status === 'done' &&
    order?.amountKobo != null &&
    v.value.receipt.amountKobo !== null &&
    v.value.receipt.amountKobo !== order.amountKobo

  return (
    <aside className="panel" aria-label="Payment desk">
      <header>
        <h2>Payment desk</h2>
        <DeviceStatus device={device} />
        {!online && (
          <p className="offline" role="status">
            You are offline. Reading receipts, capturing orders and drafting
            replies still work on this computer. Your books and bank alert
            emails catch up when you are back online, and voice notes, the books
            chat and reviews wait for the connection.
          </p>
        )}
      </header>

      {ledger.justPaid.length > 0 && data && (
        <section
          className="card now-paid"
          aria-label="Now paid"
          aria-live="polite"
        >
          <h3>Now paid</h3>
          <ul>
            {ledger.justPaid.map((id) => {
              const o = data.orders.find((x) => x.id === id)
              if (!o) return null
              return (
                <li key={id}>
                  Order {o.code} for {customerName(o.customerId)}
                  {o.amountKobo !== null && `, ${formatNaira(o.amountKobo)}`}:
                  the money arrived. Open the chat to send a confirmation.{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => ledger.seen(id)}
                  >
                    Dismiss
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {ledger.loadError && (
        <p className="error" role="alert">
          Couldn&apos;t open the records on this computer: {ledger.loadError}
        </p>
      )}

      <PanelTabs
        current={tab}
        onChange={setTab}
        counts={{ money: undecided }}
      />

      <TabPanel id="chat" current={tab}>
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
                <p className="empty">
                  {chat?.messages.length === 0
                    ? 'Click Verify payment under a receipt in the chat to check it.'
                    : 'No receipt in this chat yet.'}
                </p>
              )}
              {hasReceipt && v?.status !== 'running' && (
                <button
                  type="button"
                  disabled={device.busy}
                  onClick={() => void verify()}
                >
                  {v ? 'Verify again' : 'Verify payment'}
                </button>
              )}
              {data?.credits.length === 0 && (
                <p className="hint">
                  No bank alerts have arrived yet, so nothing can match. The
                  order is checked again as soon as one does.
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
                </>
              )}
              {shown && (
                <div className="verdict" data-kind={shown.kind}>
                  <strong>{PAYMENT_LABEL[shown.kind]}</strong>
                  {paidWhileAway && (
                    <p>
                      <strong>
                        Paid while you waited: the alert arrived after the
                        receipt was checked.
                      </strong>
                    </p>
                  )}
                  <p>{shown.text}</p>
                  {fromOrder && waited !== null && (
                    <p className="hint">
                      Waiting {formatWait(waited)}
                      {waited > shop.rules.paymentWaitMin
                        ? `, past your ${formatWait(shop.rules.paymentWaitMin)} wait. A draft will ask them to check with their bank.`
                        : '.'}
                    </p>
                  )}
                  {fromOrder && canRecheck && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => void ledger.recheck()}
                    >
                      Check again
                    </button>
                  )}
                  {current.notice && (
                    <p className="error" role="alert">
                      {current.notice}
                    </p>
                  )}
                  {shown.candidates.length > 0 &&
                    (order ? (
                      <ul className="candidates">
                        {shown.candidates.map((id) => {
                          const cr = data?.credits.find((x) => x.id === id)
                          return (
                            <li key={id}>
                              {cr
                                ? `${formatNaira(cr.amountKobo)} from ${cr.sender || 'an unknown sender'}`
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
              )}
              {chatRows.length > 0 && (
                <div className="extra-here">
                  <p>
                    <strong>Extra money from this customer</strong>
                  </p>
                  <ExtraMoney
                    rows={chatRows}
                    onSettle={settle}
                    onUndo={(id) => void ledger.unsettle(id)}
                    more={refundControls}
                  />
                </div>
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
                    · {paymentText(order, data?.credits ?? [])}
                    {order.payment.decidedBy === 'vendor' &&
                      ' (confirmed by you)'}
                    {order.payment.decidedBy === 'vendor' &&
                      order.payment.state === 'matched' && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="link"
                            onClick={() => void undoPick()}
                          >
                            Undo my choice
                          </button>
                        </>
                      )}
                  </p>
                  <p>
                    {order.items
                      .map((i) => `${i.qty} × ${i.name}`)
                      .join(', ') || 'No items listed'}
                  </p>
                  {!offersDelivery &&
                  !order.deliveryPlan ? null : current.deliveryEdit ? (
                    <form
                      className="order-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void saveDelivery()
                      }}
                    >
                      <DeliveryFields
                        form={current.deliveryEdit}
                        rules={shop.rules}
                        onChange={(deliveryEdit) =>
                          patch(chat.phone, { deliveryEdit })
                        }
                      />
                      <button type="submit">Save delivery</button>{' '}
                      <button
                        type="button"
                        className="quiet"
                        onClick={() =>
                          patch(chat.phone, { deliveryEdit: undefined })
                        }
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <p>
                      Delivery: {describePlan(order.deliveryPlan)}{' '}
                      <button
                        type="button"
                        className="link"
                        onClick={() =>
                          patch(chat.phone, {
                            deliveryEdit: toDeliveryForm(order.deliveryPlan),
                          })
                        }
                      >
                        Change
                      </button>
                    </p>
                  )}
                  {balance !== null && balance > 0 && (
                    <p className="hint">
                      Ask for the balance of {formatNaira(balance)}. When the
                      customer sends a receipt for it, verify it here and it is
                      added to this order.
                    </p>
                  )}
                  {amountGap && v?.status === 'done' && (
                    <p className="hint">
                      The receipt shows{' '}
                      {formatNaira(v.value.receipt.amountKobo ?? 0)} but the
                      order total is {formatNaira(order.amountKobo ?? 0)}.
                    </p>
                  )}
                </div>
              )}
              {!order && !c && (
                <button
                  type="button"
                  disabled={device.busy}
                  onClick={() => void capture()}
                >
                  Capture order from chat
                </button>
              )}
              {c?.status === 'running' && <p aria-live="polite">{c.note}</p>}
              {c?.status === 'error' && (
                <>
                  <p className="error" role="alert">
                    {c.message}
                  </p>
                  <button
                    type="button"
                    disabled={device.busy}
                    onClick={() => void capture()}
                  >
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
                      <legend>
                        Item {n + 1}{' '}
                        <button
                          type="button"
                          className="link"
                          aria-label={`Remove item ${n + 1}`}
                          onClick={() =>
                            editForm({
                              items: c.value.form.items.filter(
                                (_, k) => k !== n,
                              ),
                            })
                          }
                        >
                          Remove
                        </button>
                      </legend>
                      {item.pickedBy && (
                        <p className="hint">
                          <span className="badge" data-source={item.pickedBy}>
                            {item.pickedBy}
                          </span>{' '}
                          Their picture was close to a few of your photos; the
                          model picked this one. Tap another below if it is
                          wrong.
                        </p>
                      )}
                      {item.choices && (!item.productId || item.pickedBy) && (
                        <div
                          className="choices"
                          role="group"
                          aria-label="Which item is it?"
                        >
                          <p className="hint">
                            Their picture is close to these. Which is it?
                          </p>
                          {item.choices.map((id) => {
                            const p = data?.products.find((x) => x.id === id)
                            if (!p?.photo) return null
                            return (
                              <button
                                key={id}
                                type="button"
                                aria-pressed={item.productId === id}
                                className="choice"
                                onClick={() =>
                                  editForm({
                                    items: c.value.form.items.map((x, k) =>
                                      k === n
                                        ? {
                                            ...x,
                                            productId: p.id,
                                            pickedBy: undefined,
                                            name: p.name || 'Item from photo',
                                            price:
                                              p.priceKobo === null
                                                ? x.price
                                                : String(p.priceKobo / 100),
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              >
                                <img src={p.photo.thumb} alt="" />
                                <span>
                                  {p.name ||
                                    (p.dropNo ? `#${p.dropNo}` : 'Photo')}
                                  {p.priceKobo !== null &&
                                    ` · ${formatNaira(p.priceKobo)}`}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {item.productId &&
                        data?.products.find((x) => x.id === item.productId)
                          ?.photo && (
                          <img
                            className="item-photo"
                            src={
                              data.products.find(
                                (x) => x.id === item.productId,
                              )!.photo!.thumb
                            }
                            alt="Matched from the customer's picture"
                          />
                        )}
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
                      {stockNote(item)}
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
                      ['amount', 'Items total (₦)'],
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
                  {offersDelivery && (
                    <DeliveryFields
                      form={c.value.form.delivery}
                      rules={shop.rules}
                      onChange={(delivery) => editForm({ delivery })}
                    />
                  )}
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

            {current.voice && (
              <VoiceCard
                step={current.voice}
                badge={(r) => <Badge source={r.source} ms={r.ms} />}
                hasForm={current.capture?.status === 'done'}
                onUse={applyVoice}
                onClose={() => patch(chat.phone, { voice: undefined })}
              />
            )}
            {receipt && order && (
              <ReceiptCard
                key={order.id}
                receipt={receipt}
                brand={brand.brand}
                onInsert={async (text) => {
                  await host.insertDraft(chat.phone, text)
                }}
              />
            )}
            <section className="card" aria-labelledby="draft-h">
              <h3 id="draft-h">Reply</h3>
              {d?.status !== 'running' && (
                <button
                  type="button"
                  disabled={device.busy}
                  onClick={() => void draft()}
                >
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
                    The draft is in the message box. It has not been sent; edit
                    it or send it yourself.
                  </p>
                </>
              )}
            </section>
          </>
        )}
      </TabPanel>

      <TabPanel id="today" current={tab}>
        <QueueCard
          ledger={ledger}
          device={device}
          delivers={shop.rules.methods.length > 0}
          onOpen={host.openChat}
        />

        <section className="card" aria-labelledby="today-h">
          <h3 id="today-h">Today&apos;s orders</h3>
          {!data && !ledger.loadError && <p>Loading…</p>}
          {todays.length === 0 && data && (
            <p className="empty">No orders saved today yet.</p>
          )}
          {todays.length > 0 && (
            <ul className="orders">
              {todays.map((o) => (
                <li key={o.id}>
                  <span>
                    {o.code}. {customerName(o.customerId)}
                  </span>
                  <span>
                    {o.amountKobo === null ? '' : formatNaira(o.amountKobo)}
                  </span>
                  <span data-kind={o.payment.state}>
                    {paymentText(o, data?.credits ?? [])}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DropCard ledger={ledger} clock={clock} />

        <BooksCard
          ledger={ledger}
          today={today}
          lagos={lagos}
          online={online}
          ask={approval.ask}
          badge={(r) => <Badge source={r.source} ms={r.ms} />}
        />

        <TrendsCard
          ledger={ledger}
          today={today}
          lagos={lagos}
          online={online}
          ask={approval.ask}
          badge={(r) => <Badge source={r.source} ms={r.ms} />}
        />
      </TabPanel>

      <TabPanel id="money" current={tab}>
        {props.inbox}

        <section className="card" aria-labelledby="app-h">
          <h3 id="app-h">Bank app screenshot</h3>
          <p className="hint">
            When an alert email is missing, add a screenshot of today&apos;s
            history from your bank app. It is read on this computer, and only
            money the alerts did not show is added.
          </p>
          <label>
            Your bank{' '}
            <select
              value={appBank}
              onChange={(e) => setAppBank(e.target.value)}
            >
              <option value="">Not sure</option>
              {config.banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="file">
            Screenshot (PNG or JPEG){' '}
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={bankApp?.status === 'running' || device.busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void readBankAppFile(file)
              }}
            />
          </label>
          {bankApp?.status === 'running' && (
            <p aria-live="polite">{bankApp.note}</p>
          )}
          {bankApp?.status === 'error' && (
            <p className="error" role="alert">
              {bankApp.message}
            </p>
          )}
          {bankApp?.status === 'done' && (
            <>
              <Badge
                source={bankApp.value.reading.source}
                ms={bankApp.value.reading.ms}
              />
              <p>
                {bankApp.value.reading.fields.length} rows read;{' '}
                {bankApp.value.added.length === 0
                  ? 'nothing new beyond the alerts.'
                  : `${bankApp.value.added.length} new added.`}
              </p>
            </>
          )}
        </section>

        <section className="card" aria-labelledby="extra-h">
          <h3 id="extra-h">Money not tied to an order</h3>
          {extraRows.length === 0 ? (
            <p className="empty">
              {data?.credits.length
                ? 'Every credit read so far pays for an order.'
                : 'No bank alerts read yet.'}
            </p>
          ) : (
            <ExtraMoney
              rows={extraRows}
              onUndo={(id) => void ledger.unsettle(id)}
              onSettle={(row, state) =>
                void ledger.settleCredit(
                  row,
                  state,
                  row.settlement?.customerId ?? null,
                )
              }
            />
          )}
          <p className="hint">
            The desk records what you decide. Refunds are sent from your bank
            app.
          </p>
        </section>

        <MoneyFlowCard ledger={ledger} />
      </TabPanel>

      <TabPanel id="shop" current={tab}>
        <ShopRulesCard shop={shop} device={device} />

        <ReceiptLookCard brand={brand} shopName={shop.rules.shopName} />

        <StockCard ledger={ledger} device={device} />
      </TabPanel>

      <p className="privacy">
        Customer names, phone numbers and addresses stay on this computer. Your
        books in the cloud hold only amounts and payment states.
        {ledger.books.state === 'syncing' && ' Updating your books…'}
        {ledger.books.state === 'synced' && ' Books up to date.'}
        {ledger.books.state === 'offline' &&
          ' Saved on this computer; your books update when you are back online.'}
        {ledger.books.state === 'failed' &&
          ` Books not updated yet (${ledger.books.message}); orders are safe on this computer.`}
      </p>
      {approval.dialog}
    </aside>
  )
}
