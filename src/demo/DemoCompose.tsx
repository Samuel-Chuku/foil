import { useEffect, useRef, useState } from 'react'
import { rewriteStyles } from '../capture/rewrite'
import { market } from '../config/market'
import type { PanelRequest } from '../ui/host'
import { Icon } from '../ui/icons'

// The extension's AI button on WhatsApp's message box, on the demo's
// simulated one: draft a reply when it is empty, reword what is typed when
// it is not. Nothing is ever sent.
export function DemoCompose(props: {
  text: string
  onRequest: (r: PanelRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const typed = props.text.trim()

  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const choose = (r: PanelRequest) => {
    setOpen(false)
    props.onRequest(r)
  }

  return (
    <div
      ref={box}
      className="compose-help"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      {open && (
        <div
          className="compose-help-menu"
          role="menu"
          aria-label="Writing help"
        >
          <p>
            {typed
              ? 'Reword what you typed. Nothing is sent.'
              : 'The desk writes from this chat and its facts.'}
          </p>
          {typed ? (
            rewriteStyles(market()).map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                onClick={() =>
                  choose({
                    action: 'rewrite',
                    style: s.id,
                    text: typed,
                    nonce: Date.now(),
                  })
                }
              >
                {s.label}
                {!s.onDevice && <small>Cloud, after you approve</small>}
              </button>
            ))
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => choose({ action: 'draft', nonce: Date.now() })}
            >
              Draft a reply for me
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className="compose-help-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="spark" />
        {typed ? 'Rewrite' : 'Draft'}
      </button>
    </div>
  )
}
