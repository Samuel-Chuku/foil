import { useEffect, useRef, useState } from 'react'
import type { OpenChat, PanelRequest } from '../ui/host'
import { Icon, type IconName } from '../ui/icons'
import { Where } from '../ui/Where'

// The extension's floating desk, drawn in the demo's simulated WhatsApp so a
// visitor sees the same way in: one button, and a menu for the open chat.
export function DemoFloat(props: {
  chat: OpenChat
  onRequest: (r: PanelRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const launch = useRef<HTMLButtonElement>(null)

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
    where: ('device' | 'cloud')[]
    request: () => PanelRequest
  }[] = [
    ...receipts.map((m) => ({
      icon: 'receipt' as const,
      label: 'Verify the payment',
      sub: `Picture at ${m.time}`,
      where: ['device' as const],
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
      where: ['device'],
      request: () => ({ action: 'capture', nonce: nonce() }),
    },
    {
      icon: 'reply',
      label: 'Draft a reply',
      sub: 'Placed in the box, never sent',
      where: ['device'],
      request: () => ({ action: 'draft', nonce: nonce() }),
    },
    {
      icon: 'globe',
      label: 'Translate their messages',
      sub: 'Their latest messages, into English',
      where: ['device', 'cloud'],
      request: () => ({ action: 'translate', nonce: nonce() }),
    },
    {
      icon: 'spark',
      label: 'Ask the desk',
      sub: 'About orders, stock or money',
      where: ['device', 'cloud'],
      request: () => ({ action: 'ask', nonce: nonce() }),
    },
  ]

  return (
    <div
      ref={box}
      className="desk-float"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          launch.current?.focus()
        }
      }}
    >
      {open && (
        <div className="desk-float-menu" role="group" aria-label="Foil">
          <div className="desk-float-head">
            <div>
              <strong>Foil</strong>
              <span>{props.chat.contactName}</span>
            </div>
          </div>
          <ul>
            {items.map((it, n) => (
              <li key={it.label + it.sub}>
                <button
                  ref={n === 0 ? first : undefined}
                  type="button"
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
                  <Where where={it.where} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        ref={launch}
        type="button"
        className="desk-float-launch"
        aria-expanded={open}
        aria-label="Foil"
        title="Foil"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mark" />
      </button>
    </div>
  )
}
