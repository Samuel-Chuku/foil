import { useState } from 'react'
import { Icon } from '../ui/icons'

const KEY = 'setup-seen'

// What a vendor sees the first time they open the side panel: how the desk
// works beside WhatsApp Web and the three things to set up.
export function SetupCard() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== 'seen'
    } catch {
      return true
    }
  })
  if (!open) return null
  const close = () => {
    setOpen(false)
    try {
      localStorage.setItem(KEY, 'seen')
    } catch {
      // Private windows may refuse storage; this then shows again next time.
    }
  }
  return (
    <section className="card setup" data-tone="ask" aria-labelledby="setup-h">
      <h3 id="setup-h">
        <Icon name="spark" />
        Getting started
      </h3>
      <p>
        The desk works beside WhatsApp Web. It reads a chat only when you click
        one of its buttons, and it never sends anything for you.
      </p>
      <ol>
        <li>
          Open a customer&apos;s chat in WhatsApp Web. Under a receipt
          you&apos;ll find <strong>Verify payment</strong>, and under a voice
          note <strong>Read voice note</strong>.
        </li>
        <li>
          On the <strong>Money</strong> tab, connect the Gmail account your bank
          alerts arrive in, so payments can be matched.
        </li>
        <li>
          On the <strong>Shop</strong> tab, add your shop name, delivery fees
          and stock, so drafts and receipts use them.
        </li>
      </ol>
      <p className="hint">
        Receipts, chats and alerts are read on this computer. Anything that
        needs the cloud asks you first and shows exactly what would be sent.
      </p>
      <button type="button" onClick={close}>
        Got it
      </button>
    </section>
  )
}
