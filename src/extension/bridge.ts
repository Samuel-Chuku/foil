import type { OpenChat } from '../ui/host'

// Messages between the WhatsApp Web content script and the side panel. The
// chat's messages travel only when the vendor clicks one of the desk's
// buttons. Switching chats sends only which chat is open: its name and
// number, never its messages (agreed 21 Nov, for the waiting queue).

// Content script to panel.
export type FromChat = {
  kind: 'chat'
  chat: OpenChat
  // What the vendor clicked: a receipt to verify, or the order to capture.
  action: 'verify' | 'capture'
  messageId?: string
}

// Content script to panel: the vendor switched to this chat. `chat` carries
// no messages.
export type Opened = { kind: 'opened'; chat: OpenChat }

// Panel to content script.
export type ToChat =
  | { kind: 'insert-draft'; phone: string; text: string }
  // The vendor clicked a panel button that needs the open chat's messages.
  | { kind: 'read-chat' }

export type DraftReply = { ok: true } | { ok: false; reason: string }

export const isFromChat = (m: unknown): m is FromChat =>
  typeof m === 'object' && m !== null && (m as FromChat).kind === 'chat'

export const isOpened = (m: unknown): m is Opened =>
  typeof m === 'object' && m !== null && (m as Opened).kind === 'opened'
