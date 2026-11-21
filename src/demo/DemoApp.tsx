import { useEffect, useMemo, useRef, useState } from 'react'
import { drawHistory } from '../sample/historyImage'
import {
  SAMPLE_CHATS,
  SAMPLE_DAY,
  SAMPLE_DAY_MS,
  SAMPLE_EMAILS,
  SAMPLE_HISTORY,
  SAMPLE_PRODUCTS,
  SAMPLE_SHOP_RULES,
  SAMPLE_THRIFT,
} from '../sample/pack'
import { drawPiecePhoto, statusThumbnail } from '../sample/productImage'
import { drawReceipt } from '../sample/receiptImage'
import { photoFrom } from '../ui/photos'
import type { Product } from '../ledger/types'
import { importBankApp, type BankAppResult } from '../ui/bankApp'
import type { OpenChat, PanelHost, PanelRequest } from '../ui/host'
import { Panel } from '../ui/Panel'
import { useDevice } from '../ui/useDevice'
import { useLedger } from '../ui/useLedger'
import { useShopRules } from '../ui/useShopRules'
import { formatNaira } from '../verify/money'
import type { AlertResult } from '../verify/alerts'

// The hosted demo: simulated chat and inbox panes stand in for WhatsApp Web
// and Gmail, beside the same panel the extension shows.

// The sample stock, with photos drawn and fingerprinted in this browser.
async function sampleStock(): Promise<Product[]> {
  const thrift = await Promise.all(
    SAMPLE_THRIFT.map(async (t) => ({
      id: t.id,
      name: '',
      priceKobo: t.naira * 100,
      qty: 1,
      countedAt: 0,
      updatedAt: 0,
      photo: await photoFrom(drawPiecePhoto(t.piece).src),
    })),
  )
  return [...SAMPLE_PRODUCTS, ...thrift]
}

// Like WhatsApp, the chat with the latest message comes first.
function buildChats(): OpenChat[] {
  const last = (c: (typeof SAMPLE_CHATS)[number]) =>
    c.messages.at(-1)?.time ?? ''
  return [...SAMPLE_CHATS]
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
    return `${c.direction === 'credit' ? 'Credit' : 'Debit'} of ${formatNaira(c.amountKobo)} from ${c.sender || 'unknown sender'}`
  }
  if (r.status === 'untrusted') return `Ignored: ${r.reason}`
  if (r.status === 'not-a-transfer') return 'Not a transfer alert.'
  return 'Not a format the rules know yet.'
}

export default function DemoApp() {
  const chats = useMemo(() => buildChats(), [])
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
    if (stored === false) void saveRules(SAMPLE_SHOP_RULES)
  }, [stored, saveRules])
  // And with its stock, once per visit if the list is empty.
  const { data: ledgerData, saveProducts } = ledger
  const stocked = useRef(false)
  useEffect(() => {
    if (!ledgerData || stocked.current) return
    stocked.current = true
    if (ledgerData.products.length === 0) {
      void sampleStock().then(saveProducts)
    }
  }, [ledgerData, saveProducts])
  const [view, setView] = useState<'chats' | 'inbox' | 'bank'>('chats')
  const [bankApp, setBankApp] = useState<
    | { status: 'running' }
    | { status: 'done'; value: BankAppResult }
    | { status: 'error'; message: string }
    | null
  >(null)
  const [openPhone, setOpenPhone] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [request, setRequest] = useState<PanelRequest | null>(null)
  const [alerts, setAlerts] = useState<Record<string, AlertResult>>({})
  // Whether the demo has let time pass, so later alerts have arrived.
  const [later, setLater] = useState(false)
  const emails = SAMPLE_EMAILS.filter((e) => later || !e.later)
  const [openEmail, setOpenEmail] = useState<string | null>(null)
  // Bumped on reset so the inbox is read again from scratch.
  const [round, setRound] = useState(0)

  const chat = chats.find((c) => c.phone === openPhone) ?? null
  const host: PanelHost = {
    insertDraft: (phone, text) => setDrafts((d) => ({ ...d, [phone]: text })),
    // The sample day's clock: mid-afternoon, then later once time passes.
    now: () => SAMPLE_DAY_MS + (later ? 16 * 60 + 10 : 15 * 60 + 30) * 60_000,
  }

  // Stands in for the extension's inbox watch: every alert that has arrived
  // is read without a click, and waiting orders are checked again.
  const { importAlerts } = ledger
  useEffect(() => {
    let live = true
    const arrived = SAMPLE_EMAILS.filter((e) => later || !e.later)
    void importAlerts(arrived).then((results) => {
      if (live) {
        setAlerts(
          Object.fromEntries(arrived.map((e, n) => [e.id, results[n]!])),
        )
      }
    })
    return () => {
      live = false
    }
  }, [importAlerts, later, round])

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

  async function reset() {
    await ledger.reset()
    await saveRules(SAMPLE_SHOP_RULES)
    await saveProducts(await sampleStock())
    setAlerts({})
    setLater(false)
    setRound((r) => r + 1)
    setBankApp(null)
    setDrafts({})
    setOpenPhone(null)
  }

  return (
    <div className="demo">
      <header className="demo-bar">
        <p>
          <strong>Demo</strong> with sample data for {SAMPLE_DAY}. Everything
          here is invented.
        </p>
        <button type="button" className="quiet" onClick={() => void reset()}>
          Reset the demo
        </button>
      </header>

      <main className="host">
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
          <button
            type="button"
            aria-pressed={view === 'bank'}
            onClick={() => setView('bank')}
          >
            Bank app
          </button>
        </nav>

        {view === 'chats' && (
          <div className="chats">
            <ul className="chat-list" aria-label="Chats">
              {chats.map((c) => (
                <li key={c.phone}>
                  <button
                    type="button"
                    aria-current={c.phone === openPhone}
                    onClick={() => setOpenPhone(c.phone)}
                  >
                    <strong>{c.contactName}</strong>
                    <span>
                      {c.messages.at(-1)?.text ??
                        (c.messages.at(-1)?.image ? 'Photo' : '')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {!chat ? (
              <p className="empty">Choose a chat on the left.</p>
            ) : (
              <section
                className="chat"
                aria-label={`Chat with ${chat.contactName}`}
              >
                <header>
                  <strong>{chat.contactName}</strong> {chat.phone}
                </header>
                <ol className="messages">
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
                <div className="compose">
                  <label htmlFor="compose">Message</label>
                  <textarea
                    id="compose"
                    rows={3}
                    value={drafts[chat.phone] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [chat.phone]: e.target.value }))
                    }
                    placeholder="Type a message"
                  />
                  <p className="hint">
                    The desk only places drafts here. Sending is always yours.
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
                Bank alert emails for the shop&apos;s GTBank account. The desk
                watches this inbox and reads each alert as it arrives.
              </p>
              {!later && (
                <button type="button" onClick={() => setLater(true)}>
                  Let time pass: late alerts arrive
                </button>
              )}
            </div>
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
                      <span className="badge" data-source="Rules">
                        Rules
                      </span>{' '}
                      {alertLine(alerts[e.id]!)}
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
                email is missing: the desk adds only money the alerts did not
                show.
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
                <span
                  className="badge"
                  data-source={bankApp.value.reading.source}
                >
                  {bankApp.value.reading.source}
                </span>{' '}
                {(bankApp.value.reading.ms / 1000).toFixed(1)} s ·{' '}
                {bankApp.value.reading.fields.length} rows read,{' '}
                {bankApp.value.added.length === 0
                  ? 'all already known from the alerts.'
                  : `new: ${bankApp.value.added
                      .map(
                        (c) =>
                          `${c.direction === 'credit' ? '+' : '-'}${formatNaira(c.amountKobo)}`,
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
