import { useEffect, useRef, useState } from 'react'
import type { OpenChat, PanelRequest } from '../ui/host'
import { Icon, type IconName } from '../ui/icons'

// The extension's floating desk, drawn in the demo's simulated WhatsApp so a
// visitor sees the same way in: one button, and a menu for the open chat.
export function DemoFloat(props: {
  chat: OpenChat
  onRequest: (r: PanelRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const receipts = props.chat.messages
    .filter((m) => m.from === 'customer' && m.image)
    .slice(-2)
    .reverse()
  const nonce = () => Date.now()
  const items: {
    icon: IconName
    label: string
    sub: string
    request: () => PanelRequest
  }[] = [
    ...receipts.map((m) => ({
      icon: 'receipt' as const,
      label: 'Verify the payment',
      sub: `Picture at ${m.time}`,
      request: (): PanelRequest => ({
        action: 'verify',
        messageId: m.id,
        nonce: nonce(),
      }),
    })),
    {
      icon: 'bag',
      label: 'Capture the order',
      sub: 'Items, delivery and amount',
      request: () => ({ action: 'capture', nonce: nonce() }),
    },
    {
      icon: 'reply',
      label: 'Draft a reply',
      sub: 'Placed in the box, never sent',
      request: () => ({ action: 'draft', nonce: nonce() }),
    },
    {
      icon: 'globe',
      label: 'Say it in English',
      sub: 'Their latest messages',
      request: () => ({ action: 'translate', nonce: nonce() }),
    },
    {
      icon: 'spark',
      label: 'Ask the desk',
      sub: 'About orders, stock or money',
      request: () => ({ action: 'ask', nonce: nonce() }),
    },
  ]

  return (
    <div
      ref={box}
      className="desk-float"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      {open && (
        <div className="desk-float-menu" role="menu" aria-label="Payment desk">
          <div className="desk-float-head">
            <div>
              <strong>Payment desk</strong>
              <span>{props.chat.contactName}</span>
            </div>
          </div>
          <ul>
            {items.map((it, n) => (
              <li key={it.label + it.sub}>
                <button
                  ref={n === 0 ? first : undefined}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    props.onRequest(it.request())
                  }}
                >
                  <Icon name={it.icon} size={18} />
                  <span>
                    {it.label}
                    <small>{it.sub}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="desk-float-launch"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Payment desk"
        title="Payment desk"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mark" />
      </button>
    </div>
  )
}
