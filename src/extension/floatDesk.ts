// The floating desk on WhatsApp Web: one small button that stays out of the
// way, and a menu of what the desk can do for the chat that is open. It
// lives in its own shadow root, so WhatsApp's styles cannot reach it and it
// adds nothing to WhatsApp's own markup. It never sends, scrolls or clicks
// anything of WhatsApp's.

export type FloatAction =
  | { kind: 'verify'; messageId: string }
  | { kind: 'voice'; messageId: string }
  | { kind: 'capture' }
  | { kind: 'draft' }
  | { kind: 'translate' }
  | { kind: 'ask' }
  | { kind: 'open' }

// What the open chat offers, found on screen when the menu opens.
export type FloatChat = {
  name: string
  receipts: { id: string; time: string }[]
  // `played`: the note the vendor last pressed play on, whose sound the
  // desk can read.
  voiceNotes: { id: string; time: string; played?: boolean }[]
}

// Icons as SVG markup, matching the panel's set (24px grid, 1.75 stroke).
const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const ICONS = {
  receipt: svg(
    '<path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5Z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  ),
  bag: svg(
    '<path d="M5 8h14l-1 12.5H6Z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  ),
  mic: svg(
    '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  ),
  reply: svg(
    '<path d="M9.5 6 4 11l5.5 5"/><path d="M4 11h9.5a6.5 6.5 0 0 1 6.5 6.5V19"/>',
  ),
  spark: svg(
    '<path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z"/>',
  ),
  globe: svg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z"/>',
  ),
  panel: svg(
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/>',
  ),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
}

// Where each action runs: on this computer, in the cloud, or either.
export type Where = 'device' | 'cloud'
const mini = (d: string) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const WHERE_ICON: Record<Where, string> = {
  device: mini(
    '<rect x="4.5" y="5" width="15" height="10.5" rx="1.75"/><path d="M2.5 18.5h19"/>',
  ),
  cloud: mini(
    '<path d="M7.5 18.5h9.25a4.25 4.25 0 0 0 .4-8.48A5.75 5.75 0 0 0 6.1 11.3 3.6 3.6 0 0 0 7.5 18.5Z"/>',
  ),
}
const WHERE_SAID: Record<Where, string> = {
  device: 'on this computer',
  cloud: "in Google's cloud, after you approve",
}

// The icons that say where an action runs, with words for screen readers.
export function whereMarks(where: Where[]): HTMLElement {
  const span = document.createElement('span')
  span.className = 'where'
  span.innerHTML = where.map((w) => WHERE_ICON[w]).join('')
  const said = `Runs ${where.map((w) => WHERE_SAID[w]).join(' or ')}`
  span.setAttribute('role', 'img')
  span.setAttribute('aria-label', said)
  span.title = said
  return span
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --ground: rgb(239 237 229 / 0.82);
  --ink: #1b1c18; --ink2: #4a4c44; --line: rgb(27 28 24 / 0.16);
  --accent: #e4703a; --hover: rgb(27 28 24 / 0.07);
  position: fixed; z-index: 2147483000;
  font: 14px/1.4 'Schibsted Grotesk Variable', system-ui, 'Segoe UI', Roboto, sans-serif;
  color: var(--ink);
}
@media (prefers-color-scheme: dark) {
  .wrap {
    --ground: rgb(28 29 25 / 0.84); --ink: #eceae0; --ink2: #b9b8ae;
    --line: rgb(236 234 224 / 0.16); --hover: rgb(236 234 224 / 0.08);
  }
}
.launch {
  width: 52px; height: 52px; border-radius: 18px; cursor: grab;
  display: grid; place-items: center;
  background: var(--ground); border: 1.5px solid var(--line);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.16);
  transition: transform 120ms ease-out;
  touch-action: none;
}
.launch:hover { transform: translateY(-1px); }
.launch:active { cursor: grabbing; }
.mark {
  width: 20px; height: 20px; border-radius: 6px; background: var(--accent);
  box-shadow: 2px 2px 0 0 var(--ink);
}
.launch[aria-expanded='true'] .mark { transform: rotate(45deg); transition: transform 160ms ease-out; }
.menu {
  position: absolute; bottom: 64px; right: 0; width: 304px;
  padding: 8px; border-radius: 18px;
  background: var(--ground); border: 1.5px solid var(--line);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.2);
}
.menu[hidden] { display: none; }
.menu.below { bottom: auto; top: 64px; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 10px; }
.head strong { font-size: 14px; }
.head span { display: block; font-size: 12px; color: var(--ink2); }
.close { all: unset; cursor: pointer; padding: 4px; border-radius: 8px; color: var(--ink2); display: grid; }
.close:hover { background: var(--hover); }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
li button {
  all: unset; box-sizing: border-box; width: 100%; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 12px; font-size: 14px; font-weight: 600;
}
li button:hover, li button:focus-visible { background: var(--hover); }
li button:focus-visible, .launch:focus-visible, .close:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
li button small { display: block; font-weight: 400; font-size: 12px; color: var(--ink2); }
li button > span:not(.where) { flex: 1; }
.where { display: flex; gap: 4px; color: var(--ink2); margin-left: auto; }
.sep { height: 1px; background: var(--line); margin: 6px 4px; }
.note { padding: 8px 10px 4px; font-size: 12px; color: var(--ink2); }
.toast {
  position: absolute; bottom: 64px; right: 0; width: max-content; max-width: 300px;
  padding: 10px 12px; border-radius: 14px; font-size: 13px;
  background: var(--ground); border: 1.5px solid var(--line);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.toast[hidden] { display: none; }
`

const POS_KEY = 'vendor-desk-float'

type Pos = { right: number; bottom: number }

function savedPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? '') as Pos
    if (Number.isFinite(p.right) && Number.isFinite(p.bottom)) return p
  } catch {
    // First use, or the page blocks storage.
  }
  // Clear of WhatsApp's message box, its send button and the box's own AI
  // button just above it.
  return { right: 24, bottom: 150 }
}

export function mountFloatDesk(opts: {
  chat: () => FloatChat | null
  onAction: (a: FloatAction) => void
}) {
  const host = document.createElement('div')
  host.setAttribute('data-vendor-desk', 'float')
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>${CSS}</style>
  <div class="wrap">
    <div class="toast" role="status" hidden></div>
    <div class="menu" role="group" aria-label="Foil" hidden></div>
    <button class="launch" type="button" aria-expanded="false" title="Foil (drag to move)">
      <span class="mark"></span>
    </button>
  </div>`
  document.body.append(host)

  const wrap = root.querySelector<HTMLElement>('.wrap')!
  const launch = root.querySelector<HTMLButtonElement>('.launch')!
  const menu = root.querySelector<HTMLElement>('.menu')!
  const toastEl = root.querySelector<HTMLElement>('.toast')!
  let pos = savedPos()
  const place = () => {
    const maxRight = window.innerWidth - 60
    const maxBottom = window.innerHeight - 60
    pos = {
      right: Math.min(Math.max(8, pos.right), maxRight),
      bottom: Math.min(Math.max(8, pos.bottom), maxBottom),
    }
    wrap.style.right = `${pos.right}px`
    wrap.style.bottom = `${pos.bottom}px`
    // Near the top of the window, the menu opens downwards instead.
    menu.classList.toggle('below', pos.bottom > window.innerHeight - 380)
  }
  place()
  window.addEventListener('resize', place)

  let toastTimer = 0
  function toast(text: string) {
    toastEl.textContent = text
    toastEl.hidden = false
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 4000)
  }

  function item(
    icon: keyof typeof ICONS,
    label: string,
    sub: string,
    a: FloatAction,
    where: Where[] = [],
  ) {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.innerHTML = `${ICONS[icon]}<span></span>`
    const text = b.querySelector('span')!
    text.textContent = label
    if (sub) {
      const note = document.createElement('small')
      note.textContent = sub
      text.append(note)
    }
    if (where.length) b.append(whereMarks(where))
    b.addEventListener('click', () => {
      close()
      opts.onAction(a)
    })
    li.append(b)
    return li
  }

  function build() {
    const c = opts.chat()
    shown = JSON.stringify(c)
    menu.replaceChildren()
    const head = document.createElement('div')
    head.className = 'head'
    head.innerHTML = `<div><strong>Foil</strong><span></span></div><button class="close" type="button" aria-label="Close">${ICONS.close}</button>`
    head.querySelector('span')!.textContent = c?.name || 'No chat open'
    head.querySelector('.close')!.addEventListener('click', close)
    menu.append(head)
    const list = document.createElement('ul')
    if (c) {
      for (const r of c.receipts.slice(-2).reverse()) {
        list.append(
          item(
            'receipt',
            'Verify the payment',
            `Picture at ${r.time || 'the end'}`,
            {
              kind: 'verify',
              messageId: r.id,
            },
            ['device'],
          ),
        )
      }
      list.append(
        item(
          'bag',
          'Capture the order',
          'Items, delivery and amount',
          {
            kind: 'capture',
          },
          ['device'],
        ),
      )
      // The note just played, which the desk can hear; else the newest,
      // with a reminder to play it first.
      const played = c.voiceNotes.find((v) => v.played)
      const note = played ?? c.voiceNotes.at(-1)
      if (note) {
        list.append(
          item(
            'mic',
            'Read the voice note',
            played
              ? `The one you played, from ${note.time || 'this chat'}`
              : `Play it first. Newest is from ${note.time || 'this chat'}`,
            {
              kind: 'voice',
              messageId: note.id,
            },
            ['cloud'],
          ),
        )
      }
      list.append(
        item(
          'reply',
          'Draft a reply',
          'Placed in the box, never sent',
          {
            kind: 'draft',
          },
          ['device'],
        ),
      )
      list.append(
        item(
          'globe',
          'Translate their messages',
          'Their latest messages, into English',
          {
            kind: 'translate',
          },
          ['device', 'cloud'],
        ),
      )
    } else {
      const note = document.createElement('p')
      note.className = 'note'
      note.textContent =
        'Open a chat to verify a payment, capture an order or draft a reply.'
      menu.append(note)
    }
    list.append(
      item(
        'spark',
        'Ask the desk',
        'About orders, stock or money',
        {
          kind: 'ask',
        },
        ['device', 'cloud'],
      ),
    )
    menu.append(list)
    const sep = document.createElement('div')
    sep.className = 'sep'
    menu.append(sep)
    const more = document.createElement('ul')
    more.append(item('panel', 'Open the desk', '', { kind: 'open' }))
    menu.append(more)
  }

  // The menu stays open while the vendor uses WhatsApp, so it is redrawn
  // when what it offers changes, such as a voice note being played, without
  // taking the focus away.
  let shown = ''
  function refresh() {
    if (menu.hidden) return
    const now = JSON.stringify(opts.chat())
    if (now === shown) return
    build()
  }

  function open() {
    build()
    menu.hidden = false
    toastEl.hidden = true
    launch.setAttribute('aria-expanded', 'true')
    menu.querySelector<HTMLButtonElement>('li button')?.focus()
  }
  function close() {
    menu.hidden = true
    launch.setAttribute('aria-expanded', 'false')
  }

  // A press that moves more than a few pixels is a drag, not a click.
  let drag: { x: number; y: number; start: Pos; moved: boolean } | null = null
  launch.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, start: pos, moved: false }
    launch.setPointerCapture(e.pointerId)
  })
  launch.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    close()
    pos = { right: drag.start.right - dx, bottom: drag.start.bottom - dy }
    place()
  })
  launch.addEventListener('pointerup', () => {
    if (drag?.moved) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos))
      } catch {
        // The position then lasts until the page reloads.
      }
    } else if (menu.hidden) open()
    else close()
    drag = null
  })
  launch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (menu.hidden) open()
      else close()
    }
  })
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') {
      close()
      launch.focus()
    }
  })
  // Clicks elsewhere on WhatsApp leave the menu open, so the vendor can
  // play a voice note or scroll with it showing; the close button, Escape
  // or the round button close it.

  return { toast, refresh, remove: () => host.remove() }
}
