// A small "To Foil" button beside the WhatsApp message under the pointer, on
// the vendor's messages and the customer's alike. Clicking it forwards that
// one message to the desk. It lives in its own shadow root, reads nothing
// until clicked and never touches WhatsApp's own controls.

const ARROW =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6 20 11l-5.5 5"/><path d="M20 11h-9.5A6.5 6.5 0 0 0 4 17.5V19"/></svg>'

const CSS = `
:host { all: initial; }
.fwd {
  --ground: rgb(239 237 229 / 0.94); --ink: #1b1c18;
  --line: rgb(27 28 24 / 0.16); --accent: #e4703a;
  position: fixed; z-index: 2147482999;
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 9px 0 7px;
  border: 1.5px solid var(--line); border-radius: 999px;
  background: var(--ground); color: var(--ink);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  font: 600 12px/1 system-ui, 'Segoe UI', Roboto, sans-serif;
  cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
}
.fwd svg { color: var(--accent); }
.fwd:hover { border-color: var(--accent); }
.fwd:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.fwd[hidden] { display: none; }
@media (prefers-color-scheme: dark) {
  .fwd { --ground: rgb(28 29 25 / 0.95); --ink: #eceae0;
    --line: rgb(236 234 224 / 0.16); }
}
`

export function mountForwardButton(opts: {
  // Whether this row holds a message the desk can take: text, or a caption.
  canForward: (row: Element) => boolean
  // Which side the message sits on: the vendor's are on the right.
  fromVendor: (row: Element) => boolean
  onForward: (row: Element) => void
}) {
  const host = document.createElement('div')
  host.setAttribute('data-vendor-desk', 'forward')
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>${CSS}</style><button class="fwd" type="button" hidden aria-label="Forward this message to Foil" title="Forward this message to Foil">${ARROW}<span>To Foil</span></button>`
  document.body.append(host)
  const button = root.querySelector<HTMLButtonElement>('.fwd')!

  let row: Element | null = null
  let hideTimer = 0

  function hide() {
    button.hidden = true
    row = null
  }

  // Beside the bubble, on the side away from the screen's edge, clear of
  // the emoji button WhatsApp shows next to a message on hover.
  function show(next: Element) {
    clearTimeout(hideTimer)
    const bubble =
      next.querySelector('.copyable-text') ??
      next.querySelector('[data-id]') ??
      next
    const r = bubble.getBoundingClientRect()
    if (r.width === 0) return
    row = next
    button.hidden = false
    const w = button.offsetWidth || 84
    const gap = 52
    const left = opts.fromVendor(next) ? r.left - gap - w : r.right + gap
    button.style.left = `${Math.round(Math.max(8, Math.min(left, window.innerWidth - w - 8)))}px`
    button.style.top = `${Math.round(r.top + Math.min(r.height, 60) / 2 - 14)}px`
  }

  function rowAt(target: EventTarget | null): Element | null {
    const el = target instanceof Element ? target : null
    const found = el?.closest('#main [role="row"]') ?? null
    return found && opts.canForward(found) ? found : null
  }

  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.composedPath().includes(host)) {
        clearTimeout(hideTimer)
        return
      }
      const found = rowAt(e.target)
      if (found) {
        if (found !== row || button.hidden) show(found)
        return
      }
      clearTimeout(hideTimer)
      hideTimer = window.setTimeout(hide, 500)
    },
    true,
  )
  // WhatsApp's rows take the focus as the vendor moves through messages
  // with the keyboard; the button follows.
  document.addEventListener(
    'focusin',
    (e) => {
      const found = rowAt(e.target)
      if (found) show(found)
    },
    true,
  )
  document.addEventListener('scroll', hide, true)
  button.addEventListener('click', () => {
    const picked = row
    hide()
    if (picked) opts.onForward(picked)
  })
}
