import { useEffect, useState, type RefObject } from 'react'
import type { Forwarded } from '../capture/forward'
import type { ChatMessage, PanelRequest } from '../ui/host'
import { Icon } from '../ui/icons'

const forwardOf = (m: ChatMessage, text?: string): Forwarded => {
  const whole = m.text?.trim() ?? ''
  const t = (text ?? whole).trim()
  return {
    text: t,
    from: m.from,
    time: m.time,
    messageId: m.id,
    ...(t !== whole && { part: true }),
  }
}

// The extension's "To Foil" button beside a message, on the demo's
// simulated chat. It shows on hover and on keyboard focus.
export function ForwardButton(props: {
  message: ChatMessage
  onRequest: (r: PanelRequest) => void
}) {
  if (!props.message.text?.trim()) return null
  return (
    <button
      type="button"
      className="to-foil"
      aria-label="Forward this message to Foil"
      title="Forward this message to Foil"
      onClick={() =>
        props.onRequest({
          action: 'forward',
          forward: forwardOf(props.message),
          nonce: Date.now(),
        })
      }
    >
      <Icon name="forward" size={14} />
      To Foil
    </button>
  )
}

// "Send to Foil" beside text selected in a message, as on WhatsApp Web.
export function SelectionForward(props: {
  thread: RefObject<HTMLOListElement | null>
  messages: ChatMessage[]
  onRequest: (r: PanelRequest) => void
}) {
  const [picked, setPicked] = useState<{
    message: ChatMessage
    text: string
    left: number
    top: number
  } | null>(null)
  const { thread, messages } = props

  useEffect(() => {
    let timer = 0
    const read = () => {
      const sel = document.getSelection()
      const text = sel?.toString().trim() ?? ''
      const node = sel?.anchorNode ?? null
      const el = node instanceof Element ? node : node?.parentElement
      const li = el?.closest<HTMLElement>('li[data-id]')
      const message = messages.find((m) => m.id === li?.dataset.id)
      if (
        !sel ||
        sel.isCollapsed ||
        text.length < 3 ||
        !li ||
        !thread.current?.contains(li) ||
        !message
      ) {
        setPicked(null)
        return
      }
      const r = sel.getRangeAt(0).getBoundingClientRect()
      setPicked({
        message,
        text,
        left: Math.min(r.left, window.innerWidth - 160),
        top: r.bottom + 6,
      })
    }
    const onChange = () => {
      clearTimeout(timer)
      timer = window.setTimeout(read, 250)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', onChange)
    }
  }, [thread, messages])

  if (!picked) return null
  return (
    <button
      type="button"
      className="to-foil-chip"
      style={{ left: picked.left, top: picked.top }}
      // Keeps the selection while the chip is pressed.
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => {
        props.onRequest({
          action: 'forward',
          forward: forwardOf(picked.message, picked.text),
          nonce: Date.now(),
        })
        document.getSelection()?.removeAllRanges()
        setPicked(null)
      }}
    >
      <Icon name="forward" size={14} />
      Send to Foil
    </button>
  )
}
