// What the panel needs from wherever it runs: the hosted demo's simulated
// panes now, the WhatsApp Web content script in the extension later.

export type ChatImage = { mimeType: string; base64: string; src: string }

export type ChatMessage = {
  id: string
  from: 'customer' | 'vendor'
  time: string
  text?: string
  image?: ChatImage
}

export type OpenChat = {
  // The phone number as shown in the chat header.
  phone: string
  contactName: string
  messages: ChatMessage[]
}

export type PanelHost = {
  // Places text in the chat's message box. It is never sent.
  insertDraft(phone: string, text: string): void
  // The time now, in Lagos wall-clock milliseconds. The demo runs its own
  // clock on the sample day.
  now(): number
}
