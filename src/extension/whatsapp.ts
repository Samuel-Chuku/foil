import type { ChatMessage, OpenChat } from '../ui/host'
import type { DraftReply, FromChat, Opened, ToChat } from './bridge'
import { mountFloatDesk, type FloatAction, type FloatChat } from './floatDesk'
import { phoneFromText, sentByVendor, timeFrom } from './waParse'

// Runs on web.whatsapp.com. It adds the floating desk and reads the open
// chat only when the vendor picks something from it, taking only what is on
// screen. It
// never sends, scrolls, opens other chats or clicks WhatsApp's own controls.

const MARK = 'data-vendor-desk'

function composeBox(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '#main footer [contenteditable="true"][role="textbox"]',
  )
}

// A saved contact's number shows only in the Contact info panel, which the
// vendor opens by clicking the chat's name. It is read only if already open.
function contactInfoPhone(): string | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? ''
    if (!/^\s*\+\d[\d\s-]{7,}\d\s*$/.test(text)) continue
    const el = n.parentElement
    if (el?.closest('#main, #pane-side')) continue
    return phoneFromText(text)
  }
  return null
}

function chatHeader() {
  const header = document.querySelector('#main header')
  const name =
    header?.querySelector('span[dir="auto"]')?.textContent?.trim() ?? ''
  const phone =
    phoneFromText(composeBox()?.getAttribute('aria-label')) ??
    phoneFromText(name)
  return { name, phone }
}

// The key a chat is filed under: its number, or its saved name when WhatsApp
// shows no number.
function chatKey(): string {
  const { name, phone } = chatHeader()
  return phone ?? `name:${name}`
}

async function imageOf(img: HTMLImageElement) {
  await img.decode().catch(() => undefined)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')?.drawImage(img, 0, 0)
  const src = canvas.toDataURL('image/jpeg', 0.92)
  return { mimeType: 'image/jpeg', base64: src.split(',')[1] ?? '', src }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () =>
      reject(new Error('A picture in the chat could not be read.'))
    img.src = src
  })
}

// The small picture of what a message replies to, such as a status: an
// image, or a block drawn with a background image, outside the message's own
// photo. Emoji are images too, so tiny ones are skipped.
async function quotedPicture(row: Element) {
  for (const el of row.querySelectorAll<HTMLElement>('img, div, span')) {
    if (
      el.closest('[data-testid="image-thumb"]') ||
      el.closest('[data-testid^="link-preview"]') ||
      el.closest(`[${MARK}]`)
    ) {
      continue
    }
    if (el instanceof HTMLImageElement) {
      if (!/^(blob|data):/.test(el.src) || el.naturalWidth < 40) continue
      if (el.classList.contains('emoji') || el.alt.length === 1) continue
      return imageOf(el)
    }
    const bg = /url\("?((?:blob|data):[^")]+)"?\)/.exec(
      el.style.backgroundImage,
    )
    if (bg?.[1]) return imageOf(await loadImage(bg[1]))
  }
  return null
}

const VOICE_BUTTON =
  'button[aria-label="Play voice message"], button[aria-label="Pause voice message"]'

function isVoiceNote(row: Element): boolean {
  return row.querySelector(VOICE_BUTTON) !== null
}

// The player's slider gives the note's length in seconds.
function voiceSeconds(row: Element): number | null {
  const max = Number(
    row.querySelector('[role="slider"]')?.getAttribute('aria-valuemax'),
  )
  return Number.isFinite(max) && max > 0 ? max : null
}

// The audio of a voice note the vendor has already played in WhatsApp, from
// the page's own player (see whatsappMain.ts). Null when it was not played.
const VOICE_TAG = 'vendor-desk-voice'
function playedSrc(id: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', listen)
      resolve(null)
    }, 1000)
    function listen(e: MessageEvent) {
      const m = e.data as { tag?: string; id?: string; src?: string | null }
      if (e.source !== window || m?.tag !== VOICE_TAG || m.id !== id) return
      if (!('src' in m)) return
      clearTimeout(timer)
      window.removeEventListener('message', listen)
      resolve(m.src ?? null)
    }
    window.addEventListener('message', listen)
    window.postMessage({ tag: VOICE_TAG, ask: id })
  })
}

async function voiceAudio(id: string) {
  const src = await playedSrc(id)
  if (!src) return null
  const blob = await (await fetch(src)).blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  // WhatsApp voice notes are Ogg files holding Opus audio.
  return { mimeType: 'audio/ogg', base64: btoa(binary) }
}

async function readMessage(row: Element): Promise<ChatMessage | null> {
  const holder = row.querySelector('[data-id]')
  const id = holder?.getAttribute('data-id')
  if (!holder || !id) return null
  const label = [...row.querySelectorAll('span[aria-label]')]
    .map((s) => s.getAttribute('aria-label') ?? '')
    .find((l) => /:\s*$/.test(l))
  const text = [...row.querySelectorAll('.copyable-text span.selectable-text')]
    .map((s) => (s as HTMLElement).innerText.trim())
    .filter(Boolean)
    .join('\n')
  const meta = row.querySelector('[data-testid="msg-meta"]')?.textContent
  const pre = row
    .querySelector('[data-pre-plain-text]')
    ?.getAttribute('data-pre-plain-text')
  const img = row.querySelector<HTMLImageElement>(
    '[data-testid="image-thumb"] img[src^="blob:"]',
  )
  const message: ChatMessage = {
    id,
    from: sentByVendor(label) ? 'vendor' : 'customer',
    time: timeFrom(meta) || timeFrom(pre),
  }
  if (text) message.text = text
  if (isVoiceNote(row)) message.voice = { seconds: voiceSeconds(row) }
  if (img) message.image = await imageOf(img)
  const quoted = await quotedPicture(row)
  if (quoted) {
    message.quoted = {
      ...quoted,
      status: /\bstatus\b/i.test(row.textContent ?? ''),
    }
  }
  return message.text || message.image || message.quoted || message.voice
    ? message
    : null
}

async function readChat(): Promise<OpenChat> {
  const { name, phone } = chatHeader()
  const shown = phone ? null : contactInfoPhone()
  const rows = [...document.querySelectorAll('#main [role="row"]')]
  const messages: ChatMessage[] = []
  for (const row of rows) {
    const m = await readMessage(row)
    if (m) messages.push(m)
  }
  return {
    phone: phone ?? `name:${name}`,
    contactName: name,
    messages,
    ...(shown ? { shownPhone: shown } : {}),
  }
}

function toast(text: string) {
  float.toast(text)
}

// Says what actually went wrong, so the vendor knows what to do.
function problem(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e)
  if (/context invalidated/i.test(text) || !chrome.runtime?.id) {
    return 'The desk was updated. Reload WhatsApp Web, then pick this again.'
  }
  if (
    /receiving end does not exist|could not establish connection/i.test(text)
  ) {
    return 'The desk did not open. Open it from the toolbar icon, then pick this again.'
  }
  return `The desk could not read this chat (${text}). Reload WhatsApp Web and try again.`
}

async function send(action: FromChat['action'], messageId?: string) {
  let chat: OpenChat
  try {
    chat = await readChat()
    if (action === 'voice' && messageId) {
      const audio = await voiceAudio(messageId)
      if (!audio) {
        toast(
          'Play this voice note in WhatsApp first, for a second is enough, then click Read voice note again.',
        )
        return
      }
      chat = {
        ...chat,
        messages: chat.messages.map((m) =>
          m.id === messageId && m.voice
            ? { ...m, voice: { ...m.voice, audio } }
            : m,
        ),
      }
    }
  } catch (e) {
    toast(
      `The desk could not read this chat (${e instanceof Error ? e.message : String(e)}).`,
    )
    return
  }
  try {
    const message: FromChat = { kind: 'chat', chat, action, messageId }
    await deliver(message)
  } catch (e) {
    toast(problem(e))
  }
}

// The panel may still be opening after the click, so a request is sent
// again until the panel says it has it (the background script hears every
// message too, so being heard is not enough).
async function deliver(message: unknown): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      if ((await chrome.runtime.sendMessage(message)) === true) return
    } catch (e) {
      const waiting =
        /receiving end does not exist|could not establish|port closed/i.test(
          e instanceof Error ? e.message : String(e),
        )
      if (!waiting) throw e
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(
    'Could not establish connection: receiving end does not exist',
  )
}

// WhatsApp re-renders often, so the buttons are put back whenever the chat
// changes on screen.
// Tells the panel which chat is now open, by name and number only, so it can
// show that customer's order at once. No messages are read here.
let lastOpened = ''
function announceChat() {
  if (!document.querySelector('#main header')) return
  const { name, phone } = chatHeader()
  const key = phone ?? `name:${name}`
  if (!name || key === lastOpened) return
  lastOpened = key
  const opened: Opened = {
    kind: 'opened',
    chat: { phone: key, contactName: name, messages: [] },
  }
  // The panel may be closed; then there is nobody to tell.
  chrome.runtime.sendMessage(opened).catch(() => undefined)
}

// What the open chat offers the floating desk: the customer's pictures and
// voice notes on screen, by id and time. Nothing is read from them here.
function floatChat(): FloatChat | null {
  if (!document.querySelector('#main header')) return null
  const { name } = chatHeader()
  const found = (selector: string) =>
    [...document.querySelectorAll(`#main ${selector}`)].flatMap((el) => {
      const row = el.closest('[role="row"]')
      const id = row?.querySelector('[data-id]')?.getAttribute('data-id')
      if (!row || !id) return []
      const label = [...row.querySelectorAll('span[aria-label]')]
        .map((x) => x.getAttribute('aria-label') ?? '')
        .find((l) => /:\s*$/.test(l))
      if (sentByVendor(label)) return []
      const meta = row.querySelector('[data-testid="msg-meta"]')?.textContent
      return [{ id, time: timeFrom(meta) }]
    })
  return {
    name,
    receipts: found('[data-testid="image-thumb"]'),
    voiceNotes: found(VOICE_BUTTON),
  }
}

const float = mountFloatDesk({
  chat: floatChat,
  onAction: (a: FloatAction) => {
    // Opened at once, while Chrome still counts this as the vendor's click.
    chrome.runtime.sendMessage({ kind: 'open-panel' }).catch(() => undefined)
    if (a.kind === 'open') return
    if (a.kind === 'ask') {
      void deliver({ kind: 'focus-ask' }).catch((e) => toast(problem(e)))
      return
    }
    toast(
      a.kind === 'verify'
        ? 'Checking this payment in the desk…'
        : a.kind === 'voice'
          ? 'Opening the voice note in the desk…'
          : a.kind === 'draft'
            ? 'Writing a reply in the desk…'
            : 'Reading the order in the desk…',
    )
    void send(a.kind, 'messageId' in a ? a.messageId : undefined)
  },
})

let queued = false
const observer = new MutationObserver(() => {
  // After the extension is updated, this copy of the script is cut off from
  // it; it stops quietly and the reloaded page runs the new copy.
  if (!chrome.runtime?.id) {
    observer.disconnect()
    return
  }
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    announceChat()
  })
})
observer.observe(document.body, { childList: true, subtree: true })

// Places a draft in the message box of the chat it was written for, and only
// if the vendor has not started typing. Never presses send.
async function insertDraft(
  m: Extract<ToChat, { kind: 'insert-draft' }>,
): Promise<DraftReply> {
  if (chatKey() !== m.phone) {
    return {
      ok: false,
      reason:
        'That chat is no longer open in WhatsApp. Open it to place the draft.',
    }
  }
  const box = composeBox()
  if (!box) return { ok: false, reason: 'The message box was not found.' }
  if (box.innerText.trim()) {
    return {
      ok: false,
      reason: 'The message box already has text. Clear it to place the draft.',
    }
  }
  box.focus()
  document.execCommand('insertText', false, m.text)
  // WhatsApp's editor shows the text a moment later, so look again shortly.
  for (let i = 0; i < 10 && !box.innerText.trim(); i++) {
    await new Promise((r) => setTimeout(r, 50))
  }
  return box.innerText.trim()
    ? { ok: true }
    : { ok: false, reason: 'WhatsApp did not accept the draft.' }
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const m = message as ToChat
  if (m?.kind === 'read-chat') {
    void readChat().then(reply, () => reply(null))
    return true
  }
  if (m?.kind !== 'insert-draft') return
  void insertDraft(m).then(reply)
  // Keeps the channel open for the answer above.
  return true
})
