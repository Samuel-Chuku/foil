import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { drawHistory } from '../sample/historyImage'
import {
  SAMPLE_DAY_MS,
  SAMPLE_HISTORY,
  SAMPLE_DROP,
  SAMPLE_THRIFT,
} from '../sample/pack'
import { drawPiecePhoto, statusThumbnail } from '../sample/productImage'
import { drawReceipt } from '../sample/receiptImage'
import { photoFrom } from '../ui/photos'
import { customerKey } from '../ledger/ledger'
import type { Product } from '../ledger/types'
import { importBankApp, type BankAppResult } from '../ui/bankApp'
import type { OpenChat, PanelHost, PanelRequest } from '../ui/host'
import { Panel } from '../ui/Panel'
import { useDevice } from '../ui/useDevice'
import { useLedger } from '../ui/useLedger'
import { useShopRules } from '../ui/useShopRules'
import { formatMoney } from '../verify/money'
import { sampleHistory } from '../sample/history'
import { PACKS, type SamplePack } from '../sample/markets'
import { market, MARKETS, type MarketId } from '../config/market'
import { verifyFor } from '../config/marketBanks'
import { appConfig } from '../config/active'
import { rememberMarket, RAIL_NAME } from '../ui/marketChoice'
import { DemoIntro } from './DemoIntro'
import type { AlertResult } from '../verify/alerts'
import { SourceBadge } from '../ui/SourceBadge'
import { DemoCompose } from './DemoCompose'
import { DemoFloat } from './DemoFloat'
import { Avatar } from '../ui/Avatar'

// The hosted demo: simulated chat and inbox panes stand in for WhatsApp Web
// and Gmail, beside the same panel the extension shows.

const INTRO_KEY = 'demo-intro'

// The sample stock, with photos drawn and fingerprinted in this browser.
async function sampleStock(pack: SamplePack): Promise<Product[]> {
  // Lagos alone has a status drop of thrift pieces to try.
  const thrift = await Promise.all(
    (pack.extras ? SAMPLE_THRIFT : []).map(async (t) => ({
      id: t.id,
      name: '',
      priceKobo: t.naira * 100,
      qty: 1,
      countedAt: Date.now(),
      updatedAt: 0,
      photo: await photoFrom(drawPiecePhoto(t.piece).src),
      ...(t.dropNo && { dropId: SAMPLE_DROP.id, dropNo: t.dropNo }),
    })),
  )
  // Counted now, so the sample history's sales are not taken off the stock.
  const counted = pack.products.map((p) => ({ ...p, countedAt: Date.now() }))
  return [...counted, ...thrift]
}

// Like WhatsApp, the chat with the latest message comes first.
function buildChats(pack: SamplePack): OpenChat[] {
  const last = (c: (typeof pack.chats)[number]) => c.messages.at(-1)?.time ?? ''
  return [...pack.chats]
    .sort((a, b) => last(b).localeCompare(last(a)))
    .map((c) => ({
      phone: c.phone,
      contactName: c.contactName,
      messages: c.messages.map((m) => ({
        id: m.id,
        from: m.from,
        time: m.time,
        text: m.text,
        image: m.receipt ? drawReceipt(m.receipt) : undefined,
        quoted: m.statusReply
          ? { ...statusThumbnail(m.statusReply), status: true }
          : undefined,
      })),
    }))
}

function alertLine(r: AlertResult): string {
  if (r.status === 'parsed') {
    const c = r.credit
    return `${c.direction === 'credit' ? 'Credit' : 'Debit'} of ${formatMoney(c.amountKobo)} from ${c.sender || 'unknown sender'}`
  }
  if (r.status === 'untrusted') return `Ignored: ${r.reason}`
  if (r.status === 'not-a-transfer') return 'Not a transfer alert.'
  return 'Not a format the rules know yet.'
}

export default function DemoApp() {
  // The city is chosen before the page starts (see main.tsx); switching
  // reloads with that city's sample day.
  const pack = PACKS[market().id]
  const chats = useMemo(() => buildChats(pack), [pack])
  const history = useMemo(
    () => drawHistory('GTBank', SAMPLE_HISTORY.heading, SAMPLE_HISTORY.rows),
    [],
  )
  const ledger = useLedger()
  const device = useDevice()
  const shop = useShopRules()
  // The sample shop comes with its rules filled in, so drafts can quote them.
  const { stored, save: saveRules } = shop
  useEffect(() => {
    if (stored === false) void saveRules(pack.rules)
  }, [stored, saveRules, pack])
  // And with its stock and a running drop, once per visit if it has none.
  const { data: ledgerData, saveProducts, startDrop, addRecords } = ledger
  const seedStock = useCallback(async () => {
    // Two weeks of trading before the sample day, stamped on the clock the
    // panel reads order times from (see host.now below).
    const sampleNow = SAMPLE_DAY_MS + (15 * 60 + 30) * 60_000
    await addRecords(
      sampleHistory(
        SAMPLE_DAY_MS,
        14,
        (lagosMs) => lagosMs - sampleNow + Date.now(),
        pack.extras
          ? undefined
          : {
              products: pack.products,
              areaFees: pack.rules.areaFees,
              banks: verifyFor(appConfig().verify).banks.map((b) => b.id),
            },
      ),
    )
    const stock = await sampleStock(pack)
    await saveProducts(stock.filter((p) => !p.dropId))
    if (pack.extras) {
      await startDrop(
        SAMPLE_DROP,
        stock.filter((p) => p.dropId),
      )
    }
  }, [saveProducts, startDrop, addRecords, pack])
  const stocked = useRef(false)
  useEffect(() => {
    if (!ledgerData || stocked.current) return
    stocked.current = true
    if (ledgerData.products.length === 0) void seedStock()
  }, [ledgerData, seedStock])
  const [view, setView] = useState<'chats' | 'inbox' | 'bank'>('chats')
  // The introduction shows on a first visit, then on request.
  const [intro, setIntro] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) !== 'seen'
    } catch {
      return true
    }
  })
  const closeIntro = () => {
    setIntro(false)
    try {
      localStorage.setItem(INTRO_KEY, 'seen')
    } catch {
      // Private windows may refuse storage; the intro then shows next visit.
    }
  }
  const [bankApp, setBankApp] = useState<
    | { status: 'running' }
    | { status: 'done'; value: BankAppResult }
    | { status: 'error'; message: string }
    | null
  >(null)
  const [openPhone, setOpenPhone] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // A picture pasted into a chat's message box, as WhatsApp Web allows.
  const [pasted, setPasted] = useState<Record<string, string>>({})
  const [request, setRequest] = useState<PanelRequest | null>(null)
  const [alerts, setAlerts] = useState<Record<string, AlertResult>>({})
  const [alertsFailed, setAlertsFailed] = useState(false)
  // Whether the demo has let time pass, so later alerts have arrived.
  const [later, setLater] = useState(false)
  const emails = pack.emails.filter((e) => later || !e.later)
  const [openEmail, setOpenEmail] = useState<string | null>(null)
  // Bumped on reset so the inbox is read again from scratch.
  const [round, setRound] = useState(0)

  const chat = chats.find((c) => c.phone === openPhone) ?? null
  // The thread scrolls on its own; it opens at the newest message, as a
  // messenger does, and follows new ones.
  const thread = useRef<HTMLOListElement | null>(null)
  const newest = chat?.messages.at(-1)?.id
  useEffect(() => {
    const list = thread.current
    if (!list) return
    // Pictures load after the first layout and push the newest message
    // down, so each one that loads scrolls the thread again.
    const end = () => (list.scrollTop = list.scrollHeight)
    end()
    list.addEventListener('load', end, true)
    return () => list.removeEventListener('load', end, true)
  }, [openPhone, newest])
  const host: PanelHost = {
    insertDraft: (phone, text) => setDrafts((d) => ({ ...d, [phone]: text })),
    replaceDraft: async (phone, from, to) => {
      if ((drafts[phone] ?? '').trim() !== from.trim()) {
        throw new Error(
          'The message box changed since you asked. Try again on what is there now.',
        )
      }
      setDrafts((d) => ({ ...d, [phone]: to }))
    },
    // The sample day's clock: mid-afternoon, then later once time passes.
    now: () => SAMPLE_DAY_MS + (later ? 16 * 60 + 10 : 15 * 60 + 30) * 60_000,
    openChat: (key) => {
      const found = chats.find((c) => customerKey(c.phone) === key)
      if (found) {
        setView('chats')
        setOpenPhone(found.phone)
      }
    },
  }

  // Stands in for the extension's inbox watch: every alert that has arrived
  // is read without a click, and waiting orders are checked again.
  const { importAlerts } = ledger
  useEffect(() => {
    let live = true
    const arrived = pack.emails.filter((e) => later || !e.later)
    importAlerts(arrived).then(
      (results) => {
        if (!live) return
        setAlertsFailed(false)
        setAlerts(
          Object.fromEntries(arrived.map((e, n) => [e.id, results[n]!])),
        )
      },
      () => {
        if (live) setAlertsFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [importAlerts, later, round, pack])

  async function readBankApp() {
    setBankApp({ status: 'running' })
    try {
      const value = await importBankApp(
        history,
        { bank: SAMPLE_HISTORY.bank, day: SAMPLE_DAY_MS },
        device,
        ledger,
      )
      setBankApp({ status: 'done', value })
    } catch (error) {
      setBankApp({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Another city's sample day: everything on this device is cleared, then
  // the page reloads in that market.
  async function switchMarket(id: MarketId) {
    if (id === market().id) return
    rememberMarket(id)
    await ledger.reset()
    location.reload()
  }

  async function reset() {
    await ledger.reset()
    await saveRules(pack.rules)
    await seedStock()
    setAlerts({})
    setAlertsFailed(false)
    setLater(false)
    setRound((r) => r + 1)
    setBankApp(null)
    setDrafts({})
    setPasted({})
    setOpenPhone(null)
  }

  return (
    <div className="demo">
      <h1 className="visually-hidden">Foil demo</h1>
      <header className="demo-bar">
        <p>
          <strong>Demo</strong> with sample data for {pack.shop} in{' '}
          {market().city}, {pack.day}. Everything here is invented.
        </p>
        <label className="market-pick">
          City{' '}
          <select
            value={market().id}
            onChange={(e) => void switchMarket(e.target.value as MarketId)}
          >
            {(Object.keys(MARKETS) as MarketId[]).map((id) => (
              <option key={id} value={id}>
                {MARKETS[id].city}: {RAIL_NAME[MARKETS[id].rail]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="quiet" onClick={() => setIntro(true)}>
          What is this?
        </button>
        <button type="button" className="quiet" onClick={() => void reset()}>
          Reset the demo
        </button>
      </header>

      {intro && (
        <DemoIntro
          first={pack.first}
          shop={pack.shop}
          city={market().city}
          bank={pack.bank}
          receipt={
            pack.chats
              .find((c) => c.contactName === pack.first)
              ?.messages.find((m) => m.receipt)?.receipt ?? null
          }
          onStart={() => {
            closeIntro()
            setView('chats')
            setOpenPhone(
              pack.chats.find((c) => c.contactName === pack.first)?.phone ??
                null,
            )
          }}
          onSkip={closeIntro}
        />
      )}

      <main className="host" hidden={intro}>
        <nav className="tabs" aria-label="Sample apps">
          <button
            type="button"
            aria-pressed={view === 'chats'}
            onClick={() => setView('chats')}
          >
            Chats
          </button>
          <button
            type="button"
            aria-pressed={view === 'inbox'}
            onClick={() => setView('inbox')}
          >
            Inbox
          </button>
          {pack.extras && (
            <button
              type="button"
              aria-pressed={view === 'bank'}
              onClick={() => setView('bank')}
            >
              Bank app
            </button>
          )}
        </nav>

        {view === 'chats' && (
          <div className="chats">
            <ul className="chat-list" aria-label="Chats">
              {chats.map((c) => {
                const last = c.messages.at(-1)
                return (
                  <li key={c.phone}>
                    <button
                      type="button"
                      aria-current={c.phone === openPhone}
                      onClick={() => setOpenPhone(c.phone)}
                    >
                      <Avatar name={c.contactName} />
                      <span className="chat-row">
                        <strong>{c.contactName}</strong>
                        <time>{last?.time}</time>
                        <span className="preview">
                          {last?.from === 'vendor' && 'You: '}
                          {last?.text ?? (last?.image ? 'Photo' : '')}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {!chat ? (
              <div className="chat-none">
                <p>
                  <strong>Pick a customer&apos;s chat</strong>
                  Each one is a sample conversation. Open one, then let Foil
                  check its payment, take the order or draft a reply.
                </p>
              </div>
            ) : (
              <section
                className="chat"
                aria-label={`Chat with ${chat.contactName}`}
              >
                <header>
                  <Avatar name={chat.contactName} />
                  <span>
                    <strong>{chat.contactName}</strong>
                    <span className="phone">{chat.phone}</span>
                  </span>
                </header>
                <div className="thread">
                  <ol className="messages" ref={thread}>
                    <li className="day" aria-hidden="true">
                      Today
                    </li>
                    {chat.messages.map((m) => (
                      <li key={m.id} className={m.from}>
                        {m.quoted && (
                          <div className="quote">
                            <span>
                              {m.quoted.status ? 'Your status' : 'Reply to'} ·
                              Photo
                            </span>
                            <img src={m.quoted.src} alt="Your status photo" />
                          </div>
                        )}
                        {m.image ? (
                          <figure>
                            <img
                              src={m.image.src}
                              alt="Payment receipt sent by the customer"
                            />
                            <button
                              type="button"
                              className="verify"
                              onClick={() =>
                                setRequest({
                                  action: 'verify',
                                  messageId: m.id,
                                  nonce: Date.now(),
                                })
                              }
                            >
                              Verify payment
                            </button>
                          </figure>
                        ) : (
                          <p>{m.text}</p>
                        )}
                        <time>{m.time}</time>
                      </li>
                    ))}
                  </ol>
                  <DemoFloat chat={chat} onRequest={setRequest} />
                </div>
                <div className="compose">
                  <div className="compose-head">
                    <label htmlFor="compose">Message</label>
                    <DemoCompose
                      text={drafts[chat.phone] ?? ''}
                      onRequest={setRequest}
                    />
                  </div>
                  <textarea
                    id="compose"
                    rows={2}
                    value={drafts[chat.phone] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [chat.phone]: e.target.value }))
                    }
                    onPaste={(e) => {
                      const file = [...e.clipboardData.files].find((f) =>
                        f.type.startsWith('image/'),
                      )
                      if (!file) return
                      e.preventDefault()
                      const phone = chat.phone
                      const reader = new FileReader()
                      reader.onload = () =>
                        setPasted((p) => ({
                          ...p,
                          [phone]: String(reader.result),
                        }))
                      reader.readAsDataURL(file)
                    }}
                    placeholder="Type a message"
                  />
                  {pasted[chat.phone] && (
                    <figure className="pasted">
                      <img src={pasted[chat.phone]} alt="Pasted picture" />
                      <figcaption>
                        Pasted picture, not sent.{' '}
                        <button
                          type="button"
                          className="link"
                          onClick={() =>
                            setPasted((p) => {
                              const { [chat.phone]: _gone, ...rest } = p
                              return rest
                            })
                          }
                        >
                          Remove
                        </button>
                      </figcaption>
                    </figure>
                  )}
                  <p className="hint">
                    Foil only places drafts here. Sending is always yours.
                  </p>
                </div>
              </section>
            )}
          </div>
        )}

        {view === 'inbox' && (
          <section className="inbox" aria-label="Sample inbox">
            <div className="inbox-head">
              <p>
                Bank alert emails for the shop&apos;s {pack.bank} account. Foil
                watches this inbox and reads each alert as it arrives.
              </p>
              {!later && (
                <button type="button" onClick={() => setLater(true)}>
                  Let time pass: late alerts arrive
                </button>
              )}
            </div>
            {alertsFailed && (
              <p className="error" role="alert">
                Couldn&apos;t read these alerts into the records on this
                computer. Choose Reset the demo to start the day again.
              </p>
            )}
            <ul className="emails">
              {emails.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-expanded={openEmail === e.id}
                    onClick={() =>
                      setOpenEmail(openEmail === e.id ? null : e.id)
                    }
                  >
                    <span className="from">{e.from}</span>
                    <span>{e.subject}</span>
                    <time>{e.time}</time>
                  </button>
                  {alerts[e.id] && (
                    <p
                      className="alert-result"
                      data-status={alerts[e.id]!.status}
                    >
                      <SourceBadge source="Rules" /> {alertLine(alerts[e.id]!)}
                    </p>
                  )}
                  {openEmail === e.id && <pre>{e.body}</pre>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {view === 'bank' && (
          <section className="bank-app" aria-label="Sample bank app">
            <div className="inbox-head">
              <p>
                A screenshot of the shop&apos;s bank app. Use it when an alert
                email is missing: Foil adds only money the alerts did not show.
              </p>
              <button
                type="button"
                disabled={bankApp?.status === 'running'}
                onClick={() => void readBankApp()}
              >
                {bankApp?.status === 'running'
                  ? 'Reading…'
                  : 'Read this screenshot'}
              </button>
            </div>
            {bankApp?.status === 'error' && (
              <p className="error" role="alert">
                {bankApp.message}
              </p>
            )}
            {bankApp?.status === 'done' && (
              <p className="alert-result" aria-live="polite">
                <SourceBadge source={bankApp.value.reading.source} />{' '}
                {(bankApp.value.reading.ms / 1000).toFixed(1)} s ·{' '}
                {bankApp.value.reading.fields.length} rows read,{' '}
                {bankApp.value.added.length === 0
                  ? 'all already known from the alerts.'
                  : `new: ${bankApp.value.added
                      .map(
                        (c) =>
                          `${c.direction === 'credit' ? '+' : '-'}${formatMoney(c.amountKobo)}`,
                      )
                      .join(', ')}.`}
              </p>
            )}
            <img
              src={history.src}
              alt="Bank app transaction history for the sample day"
            />
          </section>
        )}
      </main>

      <Panel
        chat={chat}
        request={request}
        ledger={ledger}
        device={device}
        host={host}
        shop={shop}
      />
    </div>
  )
}
