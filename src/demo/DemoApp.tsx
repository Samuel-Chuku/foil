import { useMemo, useState } from 'react'
import { SAMPLE_CHATS, SAMPLE_DAY, SAMPLE_EMAILS } from '../sample/pack'
import { drawReceipt } from '../sample/receiptImage'
import type { OpenChat, PanelHost } from '../ui/host'
import { Panel } from '../ui/Panel'
import { useDevice } from '../ui/useDevice'
import { useLedger } from '../ui/useLedger'
import { formatNaira } from '../verify/money'
import type { AlertResult } from '../verify/alerts'

// The hosted demo: simulated chat and inbox panes stand in for WhatsApp Web
// and Gmail, beside the same panel the extension shows.

function buildChats(): OpenChat[] {
  return SAMPLE_CHATS.map((c) => ({
    phone: c.phone,
    contactName: c.contactName,
    messages: c.messages.map((m) => ({
      id: m.id,
      from: m.from,
      time: m.time,
      text: m.text,
      image: m.receipt ? drawReceipt(m.receipt) : undefined,
    })),
  }))
}

function alertLine(r: AlertResult): string {
  if (r.status === 'parsed') {
    const c = r.credit
    return `${c.direction === 'credit' ? 'Credit' : 'Debit'} of ${formatNaira(c.amountKobo)} from ${c.sender || 'unknown sender'}`
  }
  if (r.status === 'untrusted') return `Ignored: ${r.reason}`
  return 'Not a format the rules know yet.'
}

export default function DemoApp() {
  const chats = useMemo(() => buildChats(), [])
  const ledger = useLedger()
  const device = useDevice()
  const [view, setView] = useState<'chats' | 'inbox'>('chats')
  const [openPhone, setOpenPhone] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [verifyRequest, setVerifyRequest] = useState<{
    messageId: string
    nonce: number
  } | null>(null)
  const [alerts, setAlerts] = useState<AlertResult[] | null>(null)
  const [openEmail, setOpenEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const chat = chats.find((c) => c.phone === openPhone) ?? null
  const host: PanelHost = {
    insertDraft: (phone, text) => setDrafts((d) => ({ ...d, [phone]: text })),
  }

  async function readAlerts() {
    setBusy(true)
    try {
      setAlerts(await ledger.importAlerts(SAMPLE_EMAILS))
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    await ledger.reset()
    setAlerts(null)
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
                              setVerifyRequest({
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
              <p>Bank alert emails for the shop&apos;s GTBank account.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void readAlerts()}
              >
                {busy ? 'Reading…' : 'Read bank alerts'}
              </button>
            </div>
            <ul className="emails">
              {SAMPLE_EMAILS.map((e, n) => (
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
                  {alerts?.[n] && (
                    <p className="alert-result" data-status={alerts[n].status}>
                      <span className="badge" data-source="Rules">
                        Rules
                      </span>{' '}
                      {alertLine(alerts[n])}
                    </p>
                  )}
                  {openEmail === e.id && <pre>{e.body}</pre>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Panel
        chat={chat}
        verifyRequest={verifyRequest}
        ledger={ledger}
        device={device}
        host={host}
      />
    </div>
  )
}
