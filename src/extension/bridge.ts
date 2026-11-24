import type { WriteJob } from '../ai/rewrite'
import type { CloudRequest } from '../cloud/approval'
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

// Content script to the panel: the vendor picked "Ask Foil".
export type FocusAsk = { kind: 'focus-ask' }

export const isFocusAsk = (m: unknown): m is FocusAsk =>
  typeof m === 'object' && m !== null && (m as FocusAsk).kind === 'focus-ask'

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

// Writing help on WhatsApp itself, without the panel: the content script asks
// the background script, which hands the job to the desk's hidden writer
// page (an offscreen document). Only the text the vendor picked travels.
export type StyleChoice = { id: string; label: string; onDevice: boolean }

export type WriteAsk =
  | { kind: 'desk-write'; op: 'styles' }
  | { kind: 'desk-write'; op: 'start'; job: WriteJob }
  // The vendor approved, or declined, the cloud request shown on WhatsApp.
  | { kind: 'desk-write'; op: 'approve'; id: string }
  | { kind: 'desk-write'; op: 'decline'; id: string }

export type WriteAnswer =
  | { kind: 'styles'; styles: StyleChoice[] }
  | {
      kind: 'done'
      text: string
      where: 'device' | 'cloud'
      ms: number
      // Numbers in the original that the result no longer has.
      lost: string[]
    }
  // Shown on WhatsApp exactly as it would be sent, and sent only on a click.
  | {
      kind: 'approve'
      id: string
      request: Pick<CloudRequest, 'feature' | 'reason' | 'texts' | 'replaced'>
    }
  | { kind: 'declined' }
  // `openDesk`: the panel is needed first, to download the model or to
  // choose the cloud.
  | { kind: 'error'; message: string; openDesk?: boolean }

// Background to the writer page.
export type ToWriter = { kind: 'writer'; ask: WriteAsk }

export const isWriteAsk = (m: unknown): m is WriteAsk =>
  typeof m === 'object' && m !== null && (m as WriteAsk).kind === 'desk-write'

export const isToWriter = (m: unknown): m is ToWriter =>
  typeof m === 'object' && m !== null && (m as ToWriter).kind === 'writer'
