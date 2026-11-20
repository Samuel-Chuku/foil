import type { OpenChat } from '../ui/host'

// Messages between the WhatsApp Web content script and the side panel. The
// chat travels only when the vendor clicks one of the desk's buttons.

// Content script to panel.
export type FromChat = {
  kind: 'chat'
  chat: OpenChat
  // What the vendor clicked: a receipt to verify, or the order to capture.
  action: 'verify' | 'capture'
  messageId?: string
}

// Panel to content script.
export type ToChat = { kind: 'insert-draft'; phone: string; text: string }

export type DraftReply = { ok: true } | { ok: false; reason: string }

export const isFromChat = (m: unknown): m is FromChat =>
  typeof m === 'object' && m !== null && (m as FromChat).kind === 'chat'
