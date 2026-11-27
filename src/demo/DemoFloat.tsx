import { useEffect, useRef, useState } from 'react'
import { market } from '../config/market'
import { deskActions, toPanelRequest } from '../ui/deskActions'
import type { OpenChat, PanelRequest } from '../ui/host'
import { Icon } from '../ui/icons'
import { Where } from '../ui/Where'
import { useOnline } from '../ui/useOnline'

// The extension's floating desk, drawn in the demo's simulated WhatsApp so a
// visitor sees the same way in: one button, and a menu for the open chat.
export function DemoFloat(props: {
  chat: OpenChat
  onRequest: (r: PanelRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const online = useOnline()
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

  const items = deskActions(
    {
      receipts: props.chat.messages
        .filter((m) => m.from === 'customer' && m.image)
        .map((m) => ({ id: m.id, time: m.time })),
      // The sample chats carry no voice notes.
      voiceNotes: [],
    },
    { replyOnDevice: market().reply.onDevice, online },
  )

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
              <li
                key={it.label + it.sub}
                className={it.offline ? 'offline' : undefined}
              >
                <button
                  ref={n === 0 ? first : undefined}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    props.onRequest(toPanelRequest(it.action, Date.now()))
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
