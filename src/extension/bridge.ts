import type { OpenChat } from '../ui/host'

// Messages between the WhatsApp Web content script and the side panel. The
// chat's messages travel only when the vendor clicks one of the desk's
// buttons. Switching chats sends only which chat is open: its name and
// number, never its messages (agreed 21 Nov, for the waiting queue).

// Content script to panel.
export type FromChat = {
  kind: 'chat'
  chat: OpenChat
  // What the vendor picked: a receipt to verify, the order to capture, a
  // voice note to read, or a reply to draft.
  action: 'verify' | 'capture' | 'voice' | 'draft' | 'translate'
  messageId?: string
}

// Content script to panel: the vendor switched to this chat. `chat` carries
// no messages.
export type Opened = { kind: 'opened'; chat: OpenChat }

// Content script to the panel: reword what the vendor typed. `chat` names
// the chat only; its messages are not sent.
export type Rewrite = {
  kind: 'rewrite'
  chat: OpenChat
  style: string
  text: string
}

export const isRewrite = (m: unknown): m is Rewrite =>
  typeof m === 'object' && m !== null && (m as Rewrite).kind === 'rewrite'

// Content script to the panel: the vendor picked "Ask the desk".
export type FocusAsk = { kind: 'focus-ask' }

export const isFocusAsk = (m: unknown): m is FocusAsk =>
  typeof m === 'object' && m !== null && (m as FocusAsk).kind === 'focus-ask'

// Content script to the background: open the side panel on this tab.
export type OpenPanel = { kind: 'open-panel' }

// Panel to content script.
export type ToChat =
  | { kind: 'insert-draft'; phone: string; text: string }
  // Swap the box's text for a rewrite, only if it still holds `from`.
  | { kind: 'replace-draft'; phone: string; from: string; text: string }
  // The rewrite choices this shop's market offers, for the box's AI button.
  | {
      kind: 'desk-styles'
      styles: { id: string; label: string; onDevice: boolean }[]
    }
  // The vendor clicked a panel button that needs the open chat's messages.
  | { kind: 'read-chat' }

export type DraftReply = { ok: true } | { ok: false; reason: string }

export const isFromChat = (m: unknown): m is FromChat =>
  typeof m === 'object' && m !== null && (m as FromChat).kind === 'chat'

export const isOpened = (m: unknown): m is Opened =>
  typeof m === 'object' && m !== null && (m as Opened).kind === 'opened'
