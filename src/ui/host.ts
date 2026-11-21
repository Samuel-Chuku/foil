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
}

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
  // The time now, in Lagos wall-clock milliseconds. The demo runs its own
  // clock on the sample day.
  now(): number
}

// What a click in the chat asks the panel to do. Each click carries a new
// nonce so the same request is never run twice.
export type PanelRequest =
  | { action: 'verify'; messageId: string; nonce: number }
  | { action: 'capture'; nonce: number }
