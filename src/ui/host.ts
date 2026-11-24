// What the panel needs from wherever it runs: the hosted demo's simulated
// panes now, the WhatsApp Web content script in the extension later.

export type ChatImage = { mimeType: string; base64: string; src: string }

export type ChatMessage = {
  id: string
  from: 'customer' | 'vendor'
  time: string
  text?: string
  image?: ChatImage
  // The picture of what this message replies to, such as the vendor's
  // status; `status` when the reply is to a status.
  quoted?: ChatImage & { status: boolean }
  // A voice note, with its audio only when the vendor asked to read it.
  voice?: { seconds: number | null; audio?: VoiceAudio }
}

export type VoiceAudio = { mimeType: string; base64: string }

export type OpenChat = {
  // The phone number as shown in the chat header.
  phone: string
  contactName: string
  messages: ChatMessage[]
  // A saved contact's number, read from WhatsApp's Contact info panel when
  // the vendor had it open.
  shownPhone?: string
}

export type PanelHost = {
  // Places text in the chat's message box. It is never sent. Rejects when
  // that chat is no longer the one open.
  insertDraft(phone: string, text: string): void | Promise<void>
  // Swaps the message box's text for a rewrite, only if it still holds
  // exactly `from`, so nothing the vendor typed since is lost. Never sends.
  // Only the demo has it: the extension rewrites on WhatsApp itself.
  replaceDraft?(phone: string, from: string, to: string): Promise<void>
  // The time now, in shop wall-clock milliseconds. The demo runs its own
  // clock on the sample day.
  now(): number
  // Opens a customer's chat, where the host can; the extension never drives
  // WhatsApp Web, so it leaves this out.
  openChat?(customerKey: string): void
  // A token for the vendor's own Google Sheets and Calendar. Only the
  // extension can sign in; the demo shows what would be sent instead.
  // Interactive opens Google's sign-in window, so only call it from a click.
  googleToken?(interactive: boolean): Promise<string>
  forgetGoogle?(): void
  // Reads the open chat again on the vendor's click, when the panel only
  // knows which chat is open (see the WhatsApp content script).
  readChat?(): Promise<OpenChat | null>
}

// What a click in the chat asks the panel to do. Each click carries a new
// nonce so the same request is never run twice.
export type PanelRequest =
  | { action: 'verify'; messageId: string; nonce: number }
  | { action: 'capture'; nonce: number }
  | { action: 'voice'; messageId: string; nonce: number }
  | { action: 'draft'; nonce: number }
  // Reword what the vendor typed in the demo's message box.
  | { action: 'rewrite'; style: string; text: string; nonce: number }
  // Put the customer's latest messages into English.
  | { action: 'translate'; nonce: number }
  // The vendor wants to ask the desk something: its question box is focused.
  | { action: 'ask'; nonce: number }
