import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { draftRequest, writeCloudDraft, writeDraft } from '../ai/draft'
import { readOrder } from '../ai/order'
import { readRefundTo } from '../ai/refund'
import { toRefundTo } from '../capture/refundDetails'
import { rulesForDraft } from '../capture/shopRules'
import { followUpFacts, formatWait, waitingMin } from '../capture/followUp'
import {
  deliveryFacts,
  describePlan,
  planDelivery,
  planFromChat,
} from '../capture/delivery'
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
import { redact } from '../cloud/approval'
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
  orderTotal,
  productOf,
  stockFacts,
  unknownPriceFact,
  withListPrices,
  type PricedItem,
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
import type { Order, PaymentState, RefundTo, Settlement } from '../ledger/types'
import { verifyReceipt, type Verdict } from '../verify/match'
import { formatMoney, parseMoney } from '../verify/money'
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
import { MoneyPulseCard } from './MoneyPulseCard'
import { MONEY_STATE } from './moneyState'
import { ProofPair, StatePill } from './ProofPair'
import { BooksCard } from './BooksCard'
import { market } from '../config/market'
import { REF_LABEL } from '../verify/sessionId'
import { findOrders } from '../ledger/search'
import { DeliveriesCard, DeliverySteps } from './DeliveriesCard'
import { Avatar } from './Avatar'
import { AskCard } from './AskCard'
import { ReceiptCard } from './ReceiptCard'
import { ReceiptLookCard } from './ReceiptLookCard'
import { useBrand } from './useBrand'
import { PanelTabs, TabPanel, type TabId } from './PanelTabs'
import { prefs, prefsStore, replyManner, usesDrops } from './prefs'
import { SettingsView } from './SettingsView'
import { receiptFor } from '../capture/customerReceipt'
import { TrendsCard } from './TrendsCard'
import type { ShopRulesApi } from './useShopRules'
import { NeedsConsent, type DeviceApi } from './useDevice'
import { loadingLine, type LedgerApi } from './useLedger'
import { Icon } from './icons'
import { SourceBadge } from './SourceBadge'
import { lostNumbers, rewriteStyles } from '../capture/rewrite'
import { planWrite, type WriteJob } from '../ai/rewrite'
import { GoogleResult } from './GoogleResult'
import { useGoogle } from './useGoogle'
import { dailyTable, ordersTable } from '../google/sheet'
import { deliveryRunEvent, nextHour } from '../google/calendar'

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
  // The address came from this customer's last saved order, for checking.
  addressFromLast?: boolean
  // Prices the chat gave that differ from the shop's list, which won.
  chatPrices?: string[]
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
  // The vendor's own text, reworded in place in the message box.
  rewrite?: Step<{
    reading: Reading<string>
    label: string
    from: string
    to: string
    // Numbers in what they typed that the rewrite still lost after a retry.
    lost: string[]
    undone?: boolean
  }>
  // The customer's latest messages in plain English.
  translate?: Step<Reading<string>>
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

// "Same address as last time", "same place as before", "as before".
const SAME_AS_BEFORE =
  /\bsame\b.*\b(address|place|location|spot)\b|\bas (last time|before)\b/i

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
    return `Items paid, delivery ${formatMoney(balance)} to pay`
  }
  if (balance !== null && balance > 0) return `Short by ${formatMoney(balance)}`
  if (balance !== null && balance < 0) {
    return `Paid, ${formatMoney(-balance)} over`
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
      <SourceBadge source={props.source} /> {(props.ms / 1000).toFixed(1)} s
    </p>
  )
}

// The on-device model's state as one line with a mark, and, when nothing can
// be read here yet, the vendor's choice between downloading it and the cloud.
function DeviceStatus(props: { device: DeviceApi }) {
  const { device } = props
  // The download needs a connection, so it is not offered offline.
  const online = useOnline()
  const downloading = device.progress !== null || device.state === 'downloading'
  const view = downloading
    ? 'downloading'
    : device.state === 'available'
      ? device.warm === 'warming'
        ? 'warming'
        : 'ready'
      : device.consent && device.state !== 'checking'
        ? 'cloud'
        : device.state
  const line = {
    checking: 'Checking for the on-device model…',
    warming: 'Loading the on-device model so your first click is quick…',
    ready: 'On-device model ready. Receipts and chats are read here.',
    downloading:
      device.progress === null
        ? 'Chrome is downloading the on-device model.'
        : 'Downloading the on-device model',
    downloadable: 'The on-device model is not downloaded yet.',
    unavailable: 'This computer has no on-device model.',
    cloud:
      "No on-device model here, so reading goes to Google's cloud as you agreed.",
  }[view]
  const ask =
    device.asking || (device.state === 'unavailable' && !device.consent)
  const canDownload = device.state === 'downloadable' && online
  const pct =
    device.progress === null ? null : Math.round(device.progress * 100)
  return (
    <div className="device" data-state={view}>
      <p className="device-line" aria-live="polite">
        <span className="device-mark" aria-hidden="true" />
        <span>{line}</span>
        {view === 'downloadable' && !ask && online && (
          <button
            type="button"
            className="link"
            onClick={() => void device.download()}
          >
            Download it
          </button>
        )}
      </p>
      {downloading && (
        <div className="device-progress">
          <progress
            aria-label="On-device model download"
            max={100}
            {...(pct !== null && { value: pct })}
          />
          <span>
            {pct === null
              ? 'Reading here works once it finishes.'
              : `${pct}% done`}
          </span>
        </div>
      )}
      {device.waiting > 0 && (
        <p className="hint" aria-live="polite">
          {device.waiting} more {device.waiting === 1 ? 'step' : 'steps'}{' '}
          waiting for the model; they run one at a time.
        </p>
      )}
      {device.consent && (
        <p className="hint">
          {view === 'cloud'
            ? 'You can take this back at any time. '
            : 'Cloud fallback is on. '}
          <button
            type="button"
            className="link"
            onClick={() => device.setConsent(false)}
          >
            Turn the cloud off
          </button>
        </p>
      )}
      {ask && !device.consent && device.progress === null && (
        <section className="consent" aria-labelledby="consent-h">
          <h3 id="consent-h">How should this computer read?</h3>
          {canDownload && (
            <div className="consent-choice">
              <h4>On this computer</h4>
              <p>
                Chrome downloads its model once. It is large and takes a while;
                afterwards receipts, orders and drafts are read privately here,
                even offline.
              </p>
              <button type="button" onClick={() => void device.download()}>
                Download the on-device model
              </button>
            </div>
          )}
          <div className="consent-choice">
            <h4>
              {canDownload ? 'Or in the cloud, now' : "In Google's cloud"}
            </h4>
            <p>
              {canDownload
                ? ''
                : 'Without the on-device model nothing can be read on this computer. '}
              If you agree, the receipt, chat text or draft details for each
              action you click are sent to Google&apos;s Gemini service through
              Firebase. Your saved customers and orders stay on this computer
              either way, and you can turn this off at any time.
            </p>
            <button
              type="button"
              className={canDownload ? 'quiet' : undefined}
              onClick={() => device.setConsent(true)}
            >
              Use the cloud for these actions
            </button>
          </div>
          <button
            type="button"
            className="link"
            onClick={() => device.setConsent(false)}
          >
            Not now
          </button>
        </section>
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
  // Whether the shop picks its market here (the extension) or the host has
  // its own switcher (the demo).
  pickMarket?: boolean
}) {
  const { chat, ledger, device, host, shop } = props
  const online = useOnline()
  const approval = useApproval()
  const google = useGoogle(host, approval.ask)
  const [sheetNames, setSheetNames] = useState(false)
  const brand = useBrand()
  const [tab, setTab] = useState<TabId>('chat')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const userPrefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.get)
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
  const drops = usesDrops(userPrefs, data?.drops.length ?? 0)
  const [work, setWork] = useState<Record<string, Work>>({})
  const [appBank, setAppBank] = useState('')
  const [bankApp, setBankApp] = useState<Step<BankAppResult> | null>(null)
  const patch = (phone: string, next: Partial<Work>) =>
    setWork((w) => ({ ...w, [phone]: { ...w[phone], ...next } }))

  const customerId = chat ? customerKey(chat.phone) : null
  const hasReceipt = chat?.messages.some((m) => m.image) ?? false
  // An order stays open in its chat until it is delivered or collected.
  const openOrder = (orders: Order[], id: string | null) =>
    orders.find(
      (o) =>
        o.customerId === id &&
        (o.delivery === 'pending' || o.delivery === 'out'),
    ) ?? null
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
  const LAGOS_OFFSET_MS = market().utcOffsetMin * 60_000
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
  const [orderQuery, setOrderQuery] = useState('')
  const searching = orderQuery.trim() !== ''
  const listed = searching
    ? findOrders(data?.orders ?? [], data?.customers ?? [], orderQuery)
    : todays
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

  // What the vendor picked from the floating desk in WhatsApp. The ref
  // stops development double-rendering from running a click twice.
  const request = props.request
  const handled = useRef<number | null>(null)
  const onRequest = useEffectEvent((r: PanelRequest) => {
    if (r.action === 'verify') void verify(r.messageId)
    else if (r.action === 'voice') void readVoice(r.messageId)
    else if (r.action === 'draft') void draft()
    else if (r.action === 'rewrite') void rewrite(r.style, r.text)
    else if (r.action === 'translate') void translate()
    else if (r.action === 'ask') {
      setSettingsOpen(false)
      const q = document.getElementById('ask-q')
      q?.scrollIntoView({ block: 'center' })
      q?.focus()
    } else void capture()
  })
  useEffect(() => {
    if (!request || handled.current === request.nonce) return
    handled.current = request.nonce
    onRequest(request)
  }, [request])

  // A close call between stock photos goes to the model, which looks at the
  // customer's picture beside the two or three nearest photos. Used by both
  // capture and drafts, so a reply never goes out without the piece's price.
  async function photoPicks(
    items: Awaited<ReturnType<typeof pictureItems>>['items'],
    onCompare: () => void,
  ) {
    const picks = new Map<
      string,
      { productId: string; source: Reading<unknown>['source'] }
    >()
    for (const p of items) {
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
      onCompare()
      const pick = await pickPhoto(p.picture, photos, device.consent)
      const chosen =
        pick.fields === null ? undefined : p.candidates[pick.fields]
      if (chosen) {
        picks.set(p.messageId, { productId: chosen.id, source: pick.source })
      }
    }
    return picks
  }

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
      const picks = await photoPicks(pictures.items, () =>
        patch(phone, {
          capture: {
            status: 'running',
            note: 'Comparing their picture with your closest photos…',
          },
        }),
      )
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
              fromList: p.product.priceKobo !== null,
              productId: p.product.id,
            }
          : (() => {
              const pick = picks.get(p.messageId)
              const chosen = p.candidates.find((c) => c.id === pick?.productId)
              return {
                name: chosen ? chosen.name || 'Item from photo' : '',
                qty: 1,
                priceKobo: chosen?.priceKobo ?? null,
                fromList: (chosen?.priceKobo ?? null) !== null,
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
      ] as (PricedItem & {
        choices?: string[]
        pickedBy?: Reading<unknown>['source']
      })[]
      const amountKobo = orderTotal(items, f.amountKobo)
      // Figures the chat gave that the shop's list overrode, shown to the
      // vendor so a price agreed in the chat can be put back on purpose.
      const chatPrices = [
        ...items.flatMap((i) =>
          i.chatPriceKobo === undefined
            ? []
            : [
                `The chat says ${formatMoney(i.chatPriceKobo)} for ${i.name}; your list says ${formatMoney(i.priceKobo ?? 0)}.`,
              ],
        ),
        ...(f.amountKobo !== null &&
        amountKobo !== null &&
        f.amountKobo !== amountKobo
          ? [
              `The chat gives a total of ${formatMoney(f.amountKobo)}; your list adds up to ${formatMoney(amountKobo)}.`,
            ]
          : []),
      ]
      // A returning customer who gives no address, or says "same address as
      // last time", gets the one saved from their last order, marked for
      // the vendor to check.
      const saved = data?.customers.find((x) => x.id === customerId)
      const reuse =
        !!saved?.address &&
        (!f.address.trim() || SAME_AS_BEFORE.test(f.address))
      const form: OrderForm = {
        ...(claimedAt !== undefined && { claimedAt }),
        ...(reuse && { addressFromLast: true }),
        ...(chatPrices.length > 0 && { chatPrices }),
        delivery: toDeliveryForm(planDelivery(f, shop.rules, chatText)),
        customerName: f.customerName || chat.contactName,
        address: reuse ? saved.address : f.address,
        landmark: f.landmark || (reuse ? saved.landmark : ''),
        area: f.area || (reuse ? saved.area : ''),
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

  // The vendor confirms the well-known street a half-heard one is close to;
  // the address is then no longer unclear.
  function takeStreet(known: string) {
    if (!chat) return
    const phone = chat.phone
    setWork((w) => {
      const v = w[phone]?.voice
      if (v?.status !== 'done' || !v.value.fields.street) return w
      const old = v.value.fields
      const heardAs = old.street!.heard
      const fields: VoiceNote = {
        ...old,
        order: {
          ...old.order,
          address: old.order.address.replace(heardAs, known),
        },
        unsure: old.unsure.filter((u) => u !== 'address'),
        street: null,
      }
      const heard = Object.fromEntries(
        Object.entries(w[phone]?.heard ?? {}).map(([k, n]) => [
          k,
          n === old ? fields : n,
        ]),
      )
      return {
        ...w,
        [phone]: {
          ...w[phone],
          voice: { ...v, value: { ...v.value, fields } },
          heard,
        },
      }
    })
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
    const lagos = market().id === 'ng'
    const approved = await approval.ask(
      voiceRequest(
        {
          ...audio,
          ...(message.voice.seconds !== null && {
            seconds: message.voice.seconds,
          }),
        },
        {
          // Lagos brings its Pidgin glossary, areas and well-known streets;
          // other markets use the shop's own delivery areas.
          glossary: lagos ? appConfig().pidginGlossary : {},
          areas: lagos
            ? placeNames('Lagos')
            : shop.rules.areaFees.map((f) => f.area),
          streets: lagos ? LAGOS_STREETS : [],
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
        priceKobo: parseMoney(i.price),
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
        amountKobo: parseMoney(form.amount),
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

  // Rewords what the vendor typed (in the demo; the extension rewrites on
  // WhatsApp itself), then swaps it into the box only if the box still holds
  // exactly that.
  async function rewrite(styleId: string, text: string) {
    const phone = props.chat?.phone
    if (!phone) return
    const style = rewriteStyles(market()).find((x) => x.id === styleId)
    if (!style) return
    patch(phone, { rewrite: { status: 'running', note: `${style.label}…` } })
    try {
      const reading = await runWrite({
        op: 'rewrite',
        style: styleId,
        text,
        names: [props.chat?.contactName ?? '', customerName(customerId)],
      })
      if (!reading) {
        patch(phone, { rewrite: undefined })
        return
      }
      await host.replaceDraft?.(phone, text, reading.fields)
      patch(phone, {
        rewrite: {
          status: 'done',
          value: {
            reading,
            label: style.label,
            from: text,
            to: reading.fields,
            lost: lostNumbers(text, reading.fields),
          },
        },
      })
    } catch (error) {
      patch(phone, { rewrite: { status: 'error', message: errorText(error) } })
    }
  }

  // A writing job: at once on this computer, or in the cloud once the vendor
  // approves exactly what goes. Null when they decline.
  async function runWrite(job: WriteJob): Promise<Reading<string> | null> {
    const plan = planWrite(job, market(), device.consent)
    if (plan.where === 'device') {
      await device.ready()
      return plan.run()
    }
    const approved = await approval.ask(plan.request)
    return approved ? plan.run(approved) : null
  }

  async function undoRewrite() {
    const phone = props.chat?.phone
    const r = current.rewrite
    if (!phone || r?.status !== 'done') return
    try {
      await host.replaceDraft?.(phone, r.value.to, r.value.from)
      patch(phone, {
        rewrite: { status: 'done', value: { ...r.value, undone: true } },
      })
    } catch (error) {
      patch(phone, { rewrite: { status: 'error', message: errorText(error) } })
    }
  }

  // The customer's latest messages, since the vendor last wrote, in English.
  async function translate() {
    const chat = await readOpenChat()
    if (!chat) return
    const phone = chat.phone
    const lastVendor = chat.messages.map((m) => m.from).lastIndexOf('vendor')
    const lines = chat.messages
      .slice(lastVendor + 1)
      .filter((m) => m.from === 'customer' && m.text)
      .slice(-4)
      .map((m) => m.text!)
    if (lines.length === 0) {
      patch(phone, {
        translate: {
          status: 'error',
          message: 'They have not written anything since your last message.',
        },
      })
      return
    }
    patch(phone, { translate: { status: 'running', note: 'Reading…' } })
    try {
      const reading = await runWrite({
        op: 'translate',
        lines,
        names: [chat.contactName, customerName(customerKey(phone))],
      })
      if (!reading) {
        patch(phone, { translate: undefined })
        return
      }
      patch(phone, { translate: { status: 'done', value: reading } })
    } catch (error) {
      patch(phone, {
        translate: { status: 'error', message: errorText(error) },
      })
    }
  }

  async function draft() {
    const chat = await readOpenChat()
    if (!chat || !data) return
    const phone = chat.phone
    patch(phone, { draft: { status: 'running', note: 'Getting ready…' } })
    const onDevice = market().reply.onDevice
    try {
      if (onDevice) await device.ready()
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
      const pictures = order
        ? []
        : (
            await pictureItems(
              chat.messages,
              data.products,
              appConfig().photoMatch,
            )
          ).items
      // A picture close to two stock photos is settled the way capture
      // settles it; otherwise the reply has no price for what they showed.
      const picks = await photoPicks(pictures, () =>
        patch(phone, {
          draft: {
            status: 'running',
            note: 'Comparing their picture with your closest photos…',
          },
        }),
      )
      const shownItems = pictures.flatMap((p) => {
        const product =
          p.kind === 'sure'
            ? p.product
            : data.products.find(
                (x) => x.id === picks.get(p.messageId)?.productId,
              )
        return product
          ? [
              {
                name: product.name,
                qty: 1,
                priceKobo: product.priceKobo,
                productId: product.id,
              },
            ]
          : []
      })
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
                `#${p.dropNo}${p.priceKobo === null ? '' : ` (${formatMoney(p.priceKobo)})`}`,
            )
          const role = order ? roleOf(st, order.id) : null
          const price =
            product.priceKobo === null ? null : formatMoney(product.priceKobo)
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
      // Before an order, the price of what they asked about, so a delivery
      // fee can be quoted with the total.
      const priced = asked.filter((a) => !a.product.dropId)
      const askedKobo =
        priced.length > 0 && priced.every((a) => a.product.priceKobo !== null)
          ? priced.reduce((n, a) => n + a.qty * a.product.priceKobo!, 0)
          : null
      // Before an order is saved, delivery is planned from the place the
      // customer named. A confirmed transfer that covers the items but not
      // that fee leaves the fee owed, as it would on a saved order.
      const chatPlan = order ? null : planFromChat(said, shop.rules, chatText)
      const fee = chatPlan?.paidTo === 'shop' ? chatPlan.feeKobo : null
      const paidNow =
        !order && v?.verdict.kind === 'matched' ? v.receipt.amountKobo : null
      const feeOwed =
        fee && askedKobo !== null && paidNow !== null && paidNow >= askedKobo
          ? Math.max(0, askedKobo + fee - paidNow) || null
          : null
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
            ...(order ? [] : unknownPriceFact(said, asked)),
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
            order ? (order.deliveryPlan ?? null) : chatPlan,
            shop.rules,
            order ? order.amountKobo : askedKobo,
          ),
          extra: extraRows
            .filter((r) => r.settlement?.customerId === customerId)
            .map((r) => ({
              state: r.settlement!.state,
              amountKobo: r.amountKobo,
              hasAccount: Boolean(r.settlement!.refundTo?.accountNumber),
            })),
          shortKobo: balance !== null && balance > 0 ? balance : feeOwed,
          deliveryOwed:
            feeOwed !== null ||
            (!!order &&
              order.amountKobo !== null &&
              balance !== null &&
              balance > 0 &&
              paidKobo(order, data.credits) >= order.amountKobo),
          rules: rulesForDraft(shop.rules, chatText),
          complaint:
            data.chats.find((x) => x.id === customerId)?.label === 'complaint',
        },
        chatText,
        market(),
        { ...replyManner(prefs()), pidgin: prefs().pidgin },
      )
      let reading: Reading<string>
      if (onDevice) {
        reading = await writeDraft(prompt, device.consent, chatText)
      } else {
        // The chat holds names and numbers, so they are swapped out and the
        // vendor sees exactly what goes before anything leaves.
        const names = [chat.contactName, customerName(customerId)]
          .filter((n) => n && n !== 'Customer')
          .map((name) => ({ name, label: '(customer)' }))
        const { text, replaced } = redact(prompt, names)
        const approved = await approval.ask(
          draftRequest(text, market().reply.language, replaced),
        )
        if (!approved) {
          patch(phone, { draft: undefined })
          return
        }
        reading = await writeCloudDraft(approved)
      }
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
  // The two sides of the proof pair: what the receipt claims and the credit
  // the bank confirmed, if any.
  const proofReceipt =
    (fromOrder ? order?.receipt : null) ??
    (v?.status === 'done' ? v.value.receipt : null) ??
    order?.receipt ??
    null
  const proofCreditId =
    fromOrder && order?.payment.state === 'matched'
      ? order.payment.creditId
      : v?.status === 'done' && v.value.verdict.kind === 'matched'
        ? v.value.verdict.creditId
        : null
  const proofCredit = data?.credits.find((c) => c.id === proofCreditId) ?? null
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

  // Every order and a line per day, to the vendor's own sheet.
  function sendSheet() {
    if (!data) return
    return google.sendSheet(
      'sheet',
      [
        ordersTable(data.orders, data.credits, lagos.day, customerName, {
          names: sheetNames,
        }),
        dailyTable(data.orders, data.credits, lagos.day),
      ],
      host.now(),
      shop.rules.shopName,
    )
  }

  // A delivery run for one area, in the vendor's calendar.
  function addRun(area: string, orders: Order[], startMs: number) {
    return google.addToCalendar(
      `run:${area}`,
      deliveryRunEvent({
        area,
        orders,
        startMs,
        minutes: 90,
        timeZone: market().timeZone,
      }),
      'Add a delivery run',
    )
  }

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
        <div className="panel-title">
          <h2>Payment desk</h2>
          <button
            type="button"
            className="quiet"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <Icon name={settingsOpen ? 'back' : 'settings'} />
            {settingsOpen ? 'Back to the desk' : 'Settings'}
          </button>
        </div>
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

      {settingsOpen && (
        <SettingsView
          device={device}
          google={google}
          dropsRun={data?.drops.length ?? 0}
        />
      )}

      {/* Hidden rather than unmounted, so work in progress survives a visit
          to Settings. */}
      <div className="desk" hidden={settingsOpen}>
        {ledger.justPaid.length > 0 && data && (
          <section
            className="card now-paid"
            data-tone="money"
            aria-label="Now paid"
            aria-live="polite"
          >
            <h3>
              <Icon name="check" />
              Now paid
            </h3>
            <ul>
              {ledger.justPaid.map((id) => {
                const o = data.orders.find((x) => x.id === id)
                if (!o) return null
                return (
                  <li key={id}>
                    Order {o.code} for {customerName(o.customerId)}
                    {o.amountKobo !== null && `, ${formatMoney(o.amountKobo)}`}:
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
            Couldn&apos;t open the records on this computer: {ledger.loadError}{' '}
            Close and reopen the desk. If it keeps happening, check that Chrome
            is allowed to keep site data for this page.
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
              Open a chat to verify a payment, capture the order or draft a
              reply.
            </p>
          ) : (
            <>
              <header className="who customer">
                <Avatar name={chat.contactName} />
                <span>
                  <strong>{chat.contactName}</strong>
                  <span className="phone">{chat.phone}</span>
                </span>
              </header>

              <section className="card" data-tone="pay" aria-labelledby="pay-h">
                <h3 id="pay-h">
                  <Icon name="receipt" />
                  Payment
                </h3>
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
                  <Badge
                    source={v.value.reading.source}
                    ms={v.value.reading.ms}
                  />
                )}
                {shown && (
                  <div className="verdict" data-kind={shown.kind}>
                    <ProofPair
                      state={MONEY_STATE[shown.kind]}
                      receipt={proofReceipt}
                      credit={proofCredit}
                      bankName={bankName}
                    />
                    <StatePill state={MONEY_STATE[shown.kind]} />
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
                                  ? `${formatMoney(cr.amountKobo)} from ${cr.sender || 'an unknown sender'}`
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
                {v?.status === 'done' && (
                  <details className="read-fields">
                    <summary>Everything read from the receipt</summary>
                    <dl className="fields">
                      <dt>Amount</dt>
                      <dd>
                        {v.value.receipt.amountKobo === null
                          ? 'Not read'
                          : formatMoney(v.value.receipt.amountKobo)}
                      </dd>
                      <dt>Sender</dt>
                      <dd>{v.value.receipt.sender || 'Not read'}</dd>
                      <dt>Bank</dt>
                      <dd>{bankName(v.value.receipt.senderBank)}</dd>
                      <dt>
                        {REF_LABEL[market().rail].replace(/^\w/, (c) =>
                          c.toUpperCase(),
                        )}
                      </dt>
                      <dd className="mono">
                        {v.value.reading.fields.sessionId || 'Not printed'}
                      </dd>
                      <dt>Time</dt>
                      <dd>{v.value.reading.fields.dateTime || 'Not read'}</dd>
                    </dl>
                  </details>
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

              <section
                className="card"
                data-tone="order"
                aria-labelledby="order-h"
              >
                <h3 id="order-h">
                  <Icon name="bag" />
                  Order
                </h3>
                {order && (
                  <div className="saved">
                    <p>
                      <strong>Order {order.code}</strong>{' '}
                      {order.amountKobo === null
                        ? ''
                        : formatMoney(order.amountKobo)}{' '}
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
                    <DeliverySteps
                      order={order}
                      onSet={(state) =>
                        void ledger.setDelivery(order.id, state)
                      }
                    />
                    {balance !== null && balance > 0 && (
                      <p className="hint">
                        Ask for the balance of {formatMoney(balance)}. When the
                        customer sends a receipt for it, verify it here and it
                        is added to this order.
                      </p>
                    )}
                    {amountGap && v?.status === 'done' && (
                      <p className="hint">
                        The receipt shows{' '}
                        {formatMoney(v.value.receipt.amountKobo ?? 0)} but the
                        order total is {formatMoney(order.amountKobo ?? 0)}.
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
                            <SourceBadge source={item.pickedBy} /> Their picture
                            was close to a few of your photos; the model picked
                            this one. Tap another below if it is wrong.
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
                                      ` · ${formatMoney(p.priceKobo)}`}
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
                    {c.value.form.chatPrices?.map((line) => (
                      <p className="hint" key={line}>
                        {line} The list price is used; change it if you agreed a
                        different one.
                      </p>
                    ))}
                    {c.value.form.addressFromLast && (
                      <p className="hint">
                        The address is from this customer&apos;s last order.
                        Check it is still right.
                      </p>
                    )}
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
                  onStreet={takeStreet}
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
              <section
                className="card"
                data-tone="reply"
                aria-labelledby="draft-h"
              >
                <h3 id="draft-h">
                  <Icon name="reply" />
                  Reply
                </h3>
                <div className="actions reply-actions">
                  {d?.status !== 'running' && (
                    <button
                      type="button"
                      className="primary"
                      disabled={device.busy}
                      onClick={() => void draft()}
                    >
                      {d?.status === 'done' ? 'Draft again' : 'Draft a reply'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="quiet"
                    disabled={device.busy}
                    onClick={() => void translate()}
                  >
                    <Icon name="globe" />
                    Translate their messages
                  </button>
                </div>
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
                      The draft is in the message box. It has not been sent;
                      edit it or send it yourself.
                    </p>
                  </>
                )}
                {current.rewrite?.status === 'running' && (
                  <p aria-live="polite">{current.rewrite.note}</p>
                )}
                {current.rewrite?.status === 'error' && (
                  <p className="error" role="alert">
                    {current.rewrite.message}
                  </p>
                )}
                {current.rewrite?.status === 'done' && (
                  <div className="rewrite-result" aria-live="polite">
                    <Badge
                      source={current.rewrite.value.reading.source}
                      ms={current.rewrite.value.reading.ms}
                    />
                    <p>
                      {current.rewrite.value.undone
                        ? 'Your own words are back in the message box.'
                        : `Reworded: ${current.rewrite.value.label}. It is in the message box, not sent.`}
                    </p>
                    {!current.rewrite.value.undone &&
                      current.rewrite.value.lost.length > 0 && (
                        <p className="error" role="alert">
                          The rewrite left out{' '}
                          {current.rewrite.value.lost.join(', ')}. Check it
                          before you send, or put back what you wrote.
                        </p>
                      )}
                    {!current.rewrite.value.undone && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => void undoRewrite()}
                      >
                        Put back what I wrote
                      </button>
                    )}
                  </div>
                )}
                {current.translate?.status === 'running' && (
                  <p aria-live="polite">{current.translate.note}</p>
                )}
                {current.translate?.status === 'error' && (
                  <p className="error" role="alert">
                    {current.translate.message}
                  </p>
                )}
                {current.translate?.status === 'done' && (
                  <div className="translation" aria-live="polite">
                    <h4>What they said, in English</h4>
                    <p>{current.translate.value.fields}</p>
                    <Badge
                      source={current.translate.value.source}
                      ms={current.translate.value.ms}
                    />
                  </div>
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

          <section className="card" data-tone="order" aria-labelledby="today-h">
            <h3 id="today-h">
              <Icon name="bag" />
              {searching ? 'Find an order' : "Today's orders"}
            </h3>
            {/* Nothing to search until the shop has saved an order. */}
            {(searching || (data?.orders.length ?? 0) > 0) && (
              <>
                <label className="visually-hidden" htmlFor="order-search">
                  Find an order by number, name, phone or item
                </label>
                <input
                  id="order-search"
                  type="search"
                  value={orderQuery}
                  placeholder="Find by number, name, phone or item"
                  onChange={(e) => setOrderQuery(e.target.value)}
                />
              </>
            )}
            {!data && <p className="empty">{loadingLine(ledger)}</p>}
            {data && listed.length === 0 && (
              <p className="empty">
                {searching
                  ? 'No order matches that, on any day.'
                  : data.orders.length > 0
                    ? 'No orders saved today yet. Search finds older ones.'
                    : "No orders yet. Capture one from a customer's chat and it lands here."}
              </p>
            )}
            {listed.length > 0 && (
              <ul className="orders">
                {listed.map((o) => (
                  <li key={o.id}>
                    <span>
                      {o.code}.{' '}
                      {host.openChat && o.customerId ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => host.openChat?.(o.customerId!)}
                        >
                          {customerName(o.customerId)}
                        </button>
                      ) : (
                        customerName(o.customerId)
                      )}
                      {searching && lagos.day(o) !== today && (
                        <span className="hint"> · {lagos.day(o)}</span>
                      )}
                    </span>
                    <span>
                      {o.amountKobo === null ? '' : formatMoney(o.amountKobo)}
                    </span>
                    <span data-kind={o.payment.state}>
                      {paymentText(o, data?.credits ?? [])}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {drops && <DropCard ledger={ledger} clock={clock} side="live" />}

          {shop.rules.methods.length > 0 && (
            <DeliveriesCard
              ledger={ledger}
              customerName={customerName}
              onOpen={host.openChat}
              now={host.now()}
              onAddRun={(area, orders, at) => void addRun(area, orders, at)}
              runStatus={(area) => google.status[`run:${area}`]}
            />
          )}
        </TabPanel>

        <TabPanel id="money" current={tab}>
          <MoneyPulseCard ledger={ledger} now={host.now()} />

          {props.inbox}

          <section className="card" data-tone="pay" aria-labelledby="app-h">
            <h3 id="app-h">
              <Icon name="money" />
              Bank app screenshot
            </h3>
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

          <section className="card" data-tone="money" aria-labelledby="extra-h">
            <h3 id="extra-h">
              <Icon name="money" />
              Money not tied to an order
            </h3>
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
          <BooksCard ledger={ledger} today={today} lagos={lagos} />

          <TrendsCard
            ledger={ledger}
            today={today}
            lagos={lagos}
            online={online}
            ask={approval.ask}
            badge={(r) => <Badge source={r.source} ms={r.ms} />}
          />
          {data && data.orders.length > 0 && (
            <details className="card shop-rules" data-tone="money">
              <summary>
                <h3>
                  <Icon name="table" />
                  Your orders in Google Sheets
                </h3>
                <span className="hint">
                  {google.sheet?.sentAt
                    ? `Last sent ${new Date(google.sheet.sentAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : 'Every order and a total per day'}
                </span>
              </summary>
              <p className="hint">
                Every order and a total for each day, laid out in a sheet in
                your own Google Drive. Sending again replaces them, so nothing
                doubles.
              </p>
              <div className="sheet-send">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={sheetNames}
                    onChange={(e) => setSheetNames(e.target.checked)}
                  />{' '}
                  Include customer names
                </label>
                <button
                  type="button"
                  className="quiet"
                  disabled={google.status.sheet?.kind === 'busy'}
                  onClick={() => void sendSheet()}
                >
                  <Icon name="table" />
                  Send all orders
                </button>
                <GoogleResult status={google.status.sheet} />
              </div>
            </details>
          )}
        </TabPanel>

        <TabPanel id="shop" current={tab}>
          <ShopRulesCard
            shop={shop}
            device={device}
            pickMarket={props.pickMarket}
          />

          <ReceiptLookCard brand={brand} shopName={shop.rules.shopName} />

          <StockCard ledger={ledger} device={device} />

          {drops && (
            <DropCard
              ledger={ledger}
              clock={clock}
              side="setup"
              onStarted={() => setTab('today')}
            />
          )}
        </TabPanel>

        <AskCard
          deviceReady={device.state === 'available'}
          ledger={ledger}
          rules={shop.rules}
          today={today}
          lagos={lagos}
          now={() => Date.now()}
          online={online}
          ask={approval.ask}
          badge={(r) => <Badge source={r.source} ms={r.ms} />}
          openChat={host.openChat}
          sendSheet={() => void sendSheet()}
          addRun={(area, ids) =>
            void addRun(
              area,
              (data?.orders ?? []).filter((o) => ids.includes(o.id)),
              nextHour(host.now()),
            )
          }
        />
      </div>

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
