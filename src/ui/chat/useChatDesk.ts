import { useEffect, useState } from 'react'
import { planDraft } from '../../ai/draft'
import { planOrder } from '../../ai/order'
import { planRefundTo } from '../../ai/refund'
import { toRefundTo } from '../../capture/refundDetails'
import { rulesForDraft } from '../../capture/shopRules'
import { followUpFacts, PAYER_NAME_ASK } from '../../capture/followUp'
import {
  deliveryFacts,
  planDelivery,
  planFromChat,
} from '../../capture/delivery'
import { planReceipt } from '../../ai/receipt'
import { planVoice } from '../../ai/voice'
import {
  clarifyLine,
  LAGOS_STREETS,
  voiceLine,
  type VoiceNote,
} from '../../capture/voice'
import { placeNames } from '../../capture/places'
import { cloudErrorText } from '../../cloud/send'
import { useShopClock } from '../useShopClock'
import { whenApproved } from '../../ai/job'
import type { Reading } from '../../ai/run'
import { draftPrompt, draftProblem } from '../../capture/draft'
import { toOrderFields } from '../../capture/orderFields'
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
} from '../../capture/stock'
import { transcript } from '../../capture/transcript'
import { appConfig } from '../../config/active'
import {
  applyVerdict,
  balanceKobo,
  confirmCredit,
  customerKey,
  declineCredits,
  dueKobo,
  matcherLedger,
  newOrder,
  normalisePhone,
  paidKobo,
  undoCreditPick,
} from '../../ledger/ledger'
import { moreFromPayer, type ExtraRow } from '../../ledger/settle'
import type { Order, RefundTo, Settlement } from '../../ledger/types'
import { verifyReceipt } from '../../verify/match'
import { formatMoney, parseMoney } from '../../verify/money'
import { toReceipt } from '../../verify/receiptFields'
import type { OpenChat, PanelHost } from '../host'
import { fromDeliveryForm, toDeliveryForm } from '../deliveryForm'
import { pictureItems } from '../pictureItems'
import { planPhotoPick } from '../../ai/photoPick'
import {
  DEFAULT_HOLD_MIN,
  dropFacts,
  itemState,
  messageTime,
  roleOf,
  unclaimedFacts,
} from '../../capture/drop'
import { market } from '../../config/market'
import { prefs, replyManner } from '../prefs'
import type { ShopRulesApi } from '../useShopRules'
import { type LedgerApi } from '../useLedger'
import { lostNumbers, rewriteStyles } from '../../capture/rewrite'
import { planWrite, type WriteJob } from '../../ai/rewrite'

import { errorText } from '../errorText'
import type { RunJob } from '../../ai/job'
import { SAME_AS_BEFORE, type OrderForm, type Work } from './work'

// The work Foil does for the open chat: verifying receipts, capturing the
// order, voice notes, refunds, rewrites, translations and drafts, with each
// step's progress kept per chat. The panel lays it out; this hook decides.
export function useChatDesk(o: {
  chat: OpenChat | null
  ledger: LedgerApi
  host: PanelHost
  shop: ShopRulesApi
  jobs: RunJob
  // Money that pays no order, worked out once by the panel.
  extraRows: ExtraRow[]
}) {
  const { chat, ledger, host, shop, jobs, extraRows } = o
  const { data, config } = ledger
  const clock = useShopClock()
  const [work, setWork] = useState<Record<string, Work>>({})
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
    if (!o.chat || o.chat.messages.length > 0) return o.chat
    return (await host.readChat?.()) ?? o.chat
  }

  async function verify(messageId?: string, given?: OpenChat) {
    const chat = given ?? (await readOpenChat())
    if (!chat) return
    const phone = chat.phone
    const message = messageId
      ? chat.messages.find((m) => m.id === messageId)
      : [...chat.messages].reverse().find((m) => m.image)
    if (!message?.image) return
    patch(phone, {
      verify: { status: 'running', note: 'Reading the receipt…' },
    })
    try {
      const reading = await jobs(planReceipt(message.image))
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
      const pick = await jobs(planPhotoPick(p.picture, photos))
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
    patch(phone, {
      capture: {
        status: 'running',
        note: 'Reading the order from the chat…',
      },
    })
    try {
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
      const reading = await jobs(planOrder(chatText))
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
      const askedAt = asked ? messageTime(asked, host.now()) : null
      const claimedAt = askedAt === null ? undefined : clock.toEpoch(askedAt)
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
    const chat = o.chat
    const message = chat?.messages.find((m) => m.id === messageId)
    const audio = message?.voice?.audio
    if (!chat || !message?.voice || !audio) return
    const phone = chat.phone
    patch(phone, {
      voice: { status: 'running', note: 'Waiting for your approval…' },
    })
    const local = market().localVoice
    const plan = planVoice(
      {
        ...audio,
        ...(message.voice.seconds !== null && {
          seconds: message.voice.seconds,
        }),
      },
      {
        // Lagos brings its Pidgin glossary, areas and well-known streets;
        // other markets use the shop's own delivery areas.
        glossary: local ? appConfig().pidginGlossary : {},
        areas: local
          ? placeNames('Lagos')
          : shop.rules.areaFees.map((f) => f.area),
        streets: local ? LAGOS_STREETS : [],
        products: (data?.products ?? []).flatMap((p) =>
          p.name && !p.dropId ? [p.name] : [],
        ),
      },
    )
    try {
      const value = await jobs(
        whenApproved(plan, () =>
          patch(phone, {
            voice: { status: 'running', note: 'Listening in the cloud…' },
          }),
        ),
      )
      if (!value) {
        patch(phone, { voice: undefined })
        return
      }
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

  // The vendor says none of the credits on offer is this customer's, or
  // takes that answer back.
  async function answerCredits(take: typeof declineCredits) {
    if (!chat) return
    const data = await ledger.load()
    const mine = openOrder(data.orders, customerId)
    // Runs on a click, not during render (see pickCredit).
    // oxlint-disable-next-line react/purity
    const next = mine && take(mine, Date.now())
    if (!next) return
    await ledger.saveOrder(next)
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

  async function readRefund(key: string) {
    if (!chat) return
    const phone = chat.phone
    patch(phone, {
      refund: { key, status: 'running', note: 'Reading the chat…' },
    })
    try {
      const reading = await jobs(
        planRefundTo(
          transcript(
            chat.messages.map((m) => ({
              from: m.from,
              time: m.time,
              text: m.text,
              image: Boolean(m.image),
              voice: Boolean(m.voice),
            })),
          ),
        ),
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

  // Rewords what the vendor typed (in the demo; the extension rewrites on
  // WhatsApp itself), then swaps it into the box only if the box still holds
  // exactly that.
  async function rewrite(styleId: string, text: string) {
    const phone = o.chat?.phone
    if (!phone) return
    const style = rewriteStyles(market()).find((x) => x.id === styleId)
    if (!style) return
    patch(phone, { rewrite: { status: 'running', note: `${style.label}…` } })
    try {
      const reading = await runWrite({
        op: 'rewrite',
        style: styleId,
        text,
        names: [o.chat?.contactName ?? '', customerName(customerId)],
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
    return jobs(planWrite(job, market()))
  }

  async function undoRewrite() {
    const phone = o.chat?.phone
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
    patch(phone, { draft: { status: 'running', note: 'Writing a reply…' } })
    try {
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
              : !outOfLine &&
                  v?.verdict.kind === 'check' &&
                  v.verdict.why === 'name'
                ? [PAYER_NAME_ASK]
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
      const reading = await jobs(
        planDraft(prompt, chatText, {
          onDevice: market().reply.onDevice,
          language: market().reply.language,
          names: [chat.contactName, customerName(customerId)],
        }),
      )
      if (!reading) {
        patch(phone, { draft: undefined })
        return
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

  const customerName = (id: string | null) =>
    data?.customers.find((x) => x.id === id)?.name || 'Customer'

  return {
    patch,
    hasReceipt,
    order,
    current,
    chatRows,
    balance,
    settle,
    verify,
    capture,
    takeStreet,
    readVoice,
    applyVoice,
    editForm,
    saveOrder,
    pickCredit,
    answerCredits,
    undoPick,
    saveDelivery,
    readRefund,
    editRefund,
    rewrite,
    undoRewrite,
    translate,
    draft,
    customerName,
  }
}

export type ChatDesk = ReturnType<typeof useChatDesk>
