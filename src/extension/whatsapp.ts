import type { ChatMessage, OpenChat } from '../ui/host'
import type { WriteJob } from '../ai/rewrite'
import type {
  DraftReply,
  FromChat,
  Opened,
  StyleChoice,
  ToChat,
  WriteAnswer,
  WriteAsk,
} from './bridge'
import { mountComposeHelper, type ComposePick } from './composeHelper'
import {
  mountFloatDesk,
  type FloatAction,
  type FloatChat,
  type Where,
} from './floatDesk'
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
// the page itself (see whatsappMain.ts). `seen` says whether the page caught
// any note playing at all, which tells the vendor what to do next.
const VOICE_TAG = 'vendor-desk-voice'
function playedAudio(
  id: string,
): Promise<{ blob: Blob | null; seen: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', listen)
      resolve({ blob: null, seen: false })
    }, 1000)
    function listen(e: MessageEvent) {
      const m = e.data as {
        tag?: string
        id?: string
        blob?: Blob | null
        seen?: boolean
      }
      if (e.source !== window || m?.tag !== VOICE_TAG || m.id !== id) return
      if (!('blob' in m)) return
      clearTimeout(timer)
      window.removeEventListener('message', listen)
      resolve({ blob: m.blob ?? null, seen: Boolean(m.seen) })
    }
    window.addEventListener('message', listen)
    window.postMessage({ tag: VOICE_TAG, ask: id })
  })
}

async function voiceAudio(
  id: string,
): Promise<{ mimeType: string; base64: string } | { missing: string }> {
  const { blob, seen } = await playedAudio(id)
  if (!blob) {
    return {
      missing: seen
        ? 'Foil saw this note play but could not keep its sound. Play it again for a few seconds, then pick Read the voice note again.'
        : 'Play this voice note in WhatsApp first, for a few seconds, then pick Read the voice note. If you already did, reload WhatsApp Web once (needed after Foil is installed or updated) and play it again.',
    }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  // WhatsApp voice notes are Ogg files holding Opus audio.
  const type = blob.type.split(';')[0] ?? ''
  return {
    mimeType: /^audio\//.test(type) ? type : 'audio/ogg',
    base64: btoa(binary),
  }
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
    return 'Foil was updated. Reload WhatsApp Web, then pick this again.'
  }
  if (
    /receiving end does not exist|could not establish connection/i.test(text)
  ) {
    return 'Foil did not open. Open it from the toolbar icon, then pick this again.'
  }
  return `Foil could not read this chat (${text}). Reload WhatsApp Web and try again.`
}

async function send(action: FromChat['action'], messageId?: string) {
  let chat: OpenChat
  try {
    chat = await readChat()
    if (action === 'voice' && messageId) {
      const audio = await voiceAudio(messageId)
      if ('missing' in audio) {
        toast(audio.missing)
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
      `Foil could not read this chat (${e instanceof Error ? e.message : String(e)}).`,
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
// The voice note the vendor last pressed play on, by the same message id
// the page's own script keeps its sound under (whatsappMain.ts).
let lastPlayed: string | null = null
document.addEventListener(
  'click',
  (e) => {
    const button = (e.target as Element | null)?.closest?.(
      'button, [role="button"]',
    )
    if (!button || !/play/i.test(button.getAttribute('aria-label') ?? '')) {
      return
    }
    const id = button
      .closest('[role="row"]')
      ?.querySelector('[data-id]')
      ?.getAttribute('data-id')
    if (!id) return
    lastPlayed = id
    // After WhatsApp has swapped the play button for a pause button.
    setTimeout(() => float.refresh(), 150)
  },
  true,
)

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
    voiceNotes: found(VOICE_BUTTON).map((v) =>
      v.id === lastPlayed ? { ...v, played: true } : v,
    ),
  }
}

// Asks for the side panel. After the extension is reloaded, this copy of the
// script stays on the page cut off from it, and Chrome then throws at once
// rather than rejecting; the vendor is told to reload instead.
function openPanel(): boolean {
  try {
    if (!chrome.runtime?.id) throw new Error('Extension context invalidated')
    chrome.runtime.sendMessage({ kind: 'open-panel' }).catch(() => undefined)
    return true
  } catch (e) {
    toast(problem(e))
    return false
  }
}

// What the panel says while it works on each pick.
const DOING: Record<Exclude<FloatAction['kind'], 'open' | 'ask'>, string> = {
  verify: 'Checking this payment in Foil…',
  voice: 'Opening the voice note in Foil…',
  draft: 'Writing a reply in Foil…',
  translate: 'Putting their messages into English in Foil…',
  capture: 'Reading the order in Foil…',
}

const float = mountFloatDesk({
  chat: floatChat,
  replyOnDevice: () => replyOnDevice,
  onAction: (a: FloatAction) => {
    // Opened at once, while Chrome still counts this as the vendor's click.
    if (!openPanel() || a.kind === 'open') return
    if (a.kind === 'ask') {
      void deliver({ kind: 'focus-ask' }).catch((e) => toast(problem(e)))
      return
    }
    toast(DOING[a.kind])
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
    float.refresh()
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
  return (await setBoxText(box, m.text))
    ? { ok: true }
    : { ok: false, reason: 'WhatsApp did not accept the draft.' }
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

function selectAllIn(box: HTMLElement) {
  box.focus()
  const range = document.createRange()
  range.selectNodeContents(box)
  const sel = document.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

// WhatsApp's editor shows new text a moment later, so it looks again shortly.
async function shows(box: HTMLElement, text: string): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    if (flat(box.innerText) === flat(text)) return true
    await pause(50)
  }
  return false
}

// Puts text in the message box in place of what is there. WhatsApp's editor
// keeps its own copy of the text and undoes changes it did not make itself,
// so the text arrives as a person's would: typed over a selection, or failing
// that, pasted over it. The editor notices a new selection only after a
// moment, hence the pauses. Says whether the box now shows exactly `text`.
async function setBoxText(box: HTMLElement, text: string): Promise<boolean> {
  selectAllIn(box)
  await pause(40)
  document.execCommand('insertText', false, text)
  if (await shows(box, text)) return true
  selectAllIn(box)
  await pause(40)
  const data = new DataTransfer()
  data.setData('text/plain', text)
  box.dispatchEvent(
    new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }),
  )
  return shows(box, text)
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

// Writing help, run by the desk's writer page without the side panel. A
// cloud job is shown in full on WhatsApp and goes only on the vendor's click.
async function askWriter(ask: WriteAsk): Promise<WriteAnswer> {
  try {
    const answer = (await chrome.runtime.sendMessage(ask)) as
      WriteAnswer | undefined
    return answer ?? { kind: 'error', message: problem(new Error('no answer')) }
  } catch (e) {
    return { kind: 'error', message: problem(e) }
  }
}

// Whether this shop's market drafts replies on this computer; Lagos does,
// until the writer says otherwise.
let replyOnDevice = true
// The rewrite choices for this shop's market; Lagos until the writer says.
let styles: StyleChoice[] = [
  { id: 'friendlier', label: 'Friendlier', onDevice: true },
  { id: 'formal', label: 'More formal', onDevice: true },
  { id: 'shorter', label: 'Shorter', onDevice: true },
  { id: 'spelling', label: 'Fix spelling', onDevice: true },
  { id: 'pidgin', label: 'In Pidgin', onDevice: true },
  { id: 'english', label: 'In English', onDevice: true },
  { id: 'yoruba', label: 'In Yoruba', onDevice: false },
  { id: 'igbo', label: 'In Igbo', onDevice: false },
  { id: 'hausa', label: 'In Hausa', onDevice: false },
]
async function refreshStyles() {
  const answer = await askWriter({ kind: 'desk-write', op: 'styles' })
  if (answer.kind === 'styles') {
    styles = answer.styles
    replyOnDevice = answer.replyOnDevice
  }
}

async function write(
  job: WriteJob,
  title: string,
  where: Where,
): Promise<Extract<WriteAnswer, { kind: 'done' }> | null> {
  compose.busy(title, where)
  let answer = await askWriter({ kind: 'desk-write', op: 'start', job })
  if (answer.kind === 'approve') {
    const id = answer.id
    if (!(await compose.approve(answer.request))) {
      void askWriter({ kind: 'desk-write', op: 'decline', id })
      return null
    }
    compose.busy(title, 'cloud')
    answer = await askWriter({ kind: 'desk-write', op: 'approve', id })
  }
  if (answer.kind === 'error') {
    compose.error(answer.message, answer.openDesk)
    return null
  }
  if (answer.kind !== 'done') {
    compose.close()
    return null
  }
  return answer
}

const copy = (text: string) => ({
  label: 'Copy',
  run: async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied.')
    } catch {
      toast('Chrome did not allow copying. Select the text and copy it.')
    }
  },
})

// A result that is not placed in the box: shown, to copy or to use.
function offerText(
  title: string,
  done: Extract<WriteAnswer, { kind: 'done' }>,
  warning?: string,
) {
  compose.result({
    title,
    where: done.where,
    ms: done.ms,
    text: done.text,
    warning,
    actions: [
      copy(done.text),
      {
        label: composeBox()?.innerText.trim()
          ? 'Add to the message box'
          : 'Put in the message box',
        run: async () => {
          const box = composeBox()
          if (!box) return toast('Open a chat first.')
          const typed = box.innerText.trim()
          const next = typed ? `${typed}\n${done.text}` : done.text
          if (await setBoxText(box, next)) compose.close()
          else toast('WhatsApp did not take the text. Copy it instead.')
        },
      },
    ],
  })
}

const lostWarning = (lost: string[]) =>
  lost.length
    ? `The rewrite left out ${lost.join(', ')}. Check it before sending.`
    : undefined

async function rewrite(pick: Extract<ComposePick, { kind: 'rewrite' }>) {
  const { style, text, source } = pick
  const before = composeBox()?.innerText ?? ''
  const done = await write(
    { op: 'rewrite', style: style.id, text, names: [chatHeader().name] },
    style.label,
    style.onDevice ? 'device' : 'cloud',
  )
  if (!done) return
  const warning = lostWarning(done.lost)
  if (source.from === 'chat') return offerText(style.label, done, warning)
  const box = composeBox()
  // Only the part they selected changes; the rest stays as typed.
  const after =
    source.from === 'box' ? done.text : before.replace(text, done.text)
  if (!box || flat(box.innerText) !== flat(before) || after === before) {
    return offerText(
      style.label,
      done,
      'The message box changed while Foil was writing, so it was left as it is.',
    )
  }
  if (!(await setBoxText(box, after))) {
    return offerText(
      style.label,
      done,
      'WhatsApp did not take the new text, so the box was left as it is. Copy it instead.',
    )
  }
  compose.result({
    title: `${style.label}: in the message box, not sent`,
    where: done.where,
    ms: done.ms,
    warning,
    actions: [
      {
        label: 'Put back what I wrote',
        run: async () => {
          const now = composeBox()
          if (!now || flat(now.innerText) !== flat(after)) {
            return toast(
              'The message box changed since, so it was left as it is.',
            )
          }
          if (await setBoxText(now, before)) compose.close()
          else toast('WhatsApp did not take the text back.')
        },
      },
    ],
  })
}

async function meaning(text: string) {
  const done = await write(
    { op: 'translate', lines: [text], names: [chatHeader().name] },
    'What it means',
    'device',
  )
  if (done) offerText('What it means in English', done)
}

async function fromClipboard() {
  let text = ''
  try {
    text = (await navigator.clipboard.readText()).trim()
  } catch {
    compose.error(
      'Chrome did not let Foil read what you copied. Allow it when Chrome asks, or select the text in the chat instead.',
    )
    return
  }
  if (!text) {
    compose.error('Nothing text-like has been copied yet.')
    return
  }
  compose.offer(text)
}

const compose = mountComposeHelper({
  box: composeBox,
  chatArea: () => document.querySelector<HTMLElement>('#main'),
  styles: () => styles,
  onOpenDesk: () => void openPanel(),
  onPick: (pick) => {
    if (pick.kind === 'draft') {
      // A draft is built from the chat, the order and the payment the panel
      // holds, so it opens there.
      if (!openPanel()) return
      toast('Writing a reply in Foil…')
      void send('draft')
      return
    }
    if (pick.kind === 'clipboard') return void fromClipboard()
    if (pick.kind === 'meaning') return void meaning(pick.text)
    void rewrite(pick)
  },
})

void refreshStyles()
// The vendor may change the shop's market in the panel meanwhile.
window.addEventListener('focus', () => void refreshStyles())
