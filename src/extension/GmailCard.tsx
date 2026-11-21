import { useState } from 'react'
import { gmailClientId } from './gmailAuth'
import type { AccountStatus, GmailApi } from './useGmail'

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  })

function statusText(
  s: AccountStatus | undefined,
  bankName: (id: string) => string,
): string {
  if (!s || s.state === 'checking') return 'Checking…'
  if (s.state === 'offline') {
    return 'Offline. The desk will check again as soon as you are back online.'
  }
  if (s.state === 'signed-out')
    return 'Signed out. Sign in again to keep reading alerts.'
  if (s.state === 'error') return `Could not check: ${s.message}`
  const unread = s.unread
    ? ` ${s.unread} from ${s.unreadBanks.map(bankName).join(', ')} in a layout the desk cannot read yet.`
    : ''
  return `Checked at ${clock(s.checkedAt)}. ${s.read} alert${s.read === 1 ? '' : 's'} read since you opened the desk.${unread}`
}

export function GmailCard(props: {
  gmail: GmailApi
  bankName: (id: string) => string
}) {
  const { gmail, bankName } = props
  const s = gmail.settings
  const [label, setLabel] = useState<string | null>(null)
  const shownLabel = label ?? s?.label ?? ''

  if (!gmailClientId()) {
    return (
      <section className="card" aria-labelledby="gmail-h">
        <h3 id="gmail-h">Bank alert emails</h3>
        <p className="error">
          Gmail reading is not set up in this build. Add the Gmail client ID to
          the extension&apos;s settings and build it again.
        </p>
      </section>
    )
  }

  return (
    <section className="card" aria-labelledby="gmail-h">
      <h3 id="gmail-h">Bank alert emails</h3>
      <p className="hint">
        The desk reads your bank alerts from Gmail every 45 seconds while this
        panel is open, and checks waiting orders as money lands. It can only
        read, never send or delete, and it asks Google only for mail under your
        label or from known bank addresses, so the rest of your inbox is never
        downloaded.
      </p>
      {!s && <p>Loading…</p>}
      {s && (
        <form
          className="order-form"
          onSubmit={(e) => {
            e.preventDefault()
            void gmail.setLabel(shownLabel.trim()).then(() => setLabel(null))
          }}
        >
          <label>
            Gmail label
            <input
              value={shownLabel}
              placeholder="Empty: use the known bank addresses"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <p className="hint">
            {shownLabel.trim()
              ? 'Only mail with this label is read. Alerts are still trusted only from exact bank addresses.'
              : 'With no label, only mail from the known bank alert addresses is read.'}
          </p>
          {label !== null && label.trim() !== s.label && (
            <button type="submit" className="quiet">
              Use this label
            </button>
          )}
        </form>
      )}
      {s && s.accounts.length === 0 && (
        <p className="empty">No Gmail account connected yet.</p>
      )}
      {s && s.accounts.length > 0 && (
        <ul className="accounts">
          {s.accounts.map((a) => {
            const st = gmail.status[a.email]
            return (
              <li key={a.email}>
                <strong>{a.email}</strong>
                <span
                  className={
                    st?.state === 'signed-out' || st?.state === 'error'
                      ? 'error'
                      : 'hint'
                  }
                >
                  {statusText(st, bankName)}
                </span>
                <span>
                  {st?.state === 'signed-out' && (
                    <button
                      type="button"
                      className="quiet"
                      disabled={gmail.connecting}
                      onClick={() => void gmail.connect(a.email)}
                    >
                      Sign in again
                    </button>
                  )}{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => void gmail.disconnect(a.email)}
                  >
                    Disconnect
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {s && (
        <button
          type="button"
          disabled={gmail.connecting}
          onClick={() => void gmail.connect()}
        >
          {gmail.connecting
            ? 'Waiting for Google…'
            : s.accounts.length === 0
              ? 'Connect a Gmail account'
              : 'Connect another Gmail account'}
        </button>
      )}
      {gmail.error && (
        <p className="error" role="alert">
          {gmail.error}
        </p>
      )}
      <p className="hint">
        Alerts from several accounts go into one list; the same alert seen twice
        counts once.
      </p>
    </section>
  )
}
