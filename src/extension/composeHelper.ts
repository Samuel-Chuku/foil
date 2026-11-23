// A small AI button on WhatsApp's message box. With the box empty it offers
// a drafted reply; with text in it, the shop's rewrites: friendlier, more
// formal, shorter, spelling, another language. It only ever changes the box
// on the vendor's pick, through the panel, and never sends.

export type ComposePick =
  { kind: 'draft' } | { kind: 'rewrite'; style: string; text: string }

const SPARK =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5ZM18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/></svg>'

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --ground: rgb(239 237 229 / 0.9); --ink: #1b1c18; --ink2: #4a4c44;
  --line: rgb(27 28 24 / 0.16); --accent: #e4703a; --hover: rgb(27 28 24 / 0.07);
  position: fixed; z-index: 2147483000;
  font: 14px/1.4 'Schibsted Grotesk Variable', 'Helvetica Neue', Arial, sans-serif;
  color: var(--ink);
}
@media (prefers-color-scheme: dark) {
  .wrap { --ground: rgb(28 29 25 / 0.92); --ink: #eceae0; --ink2: #b9b8ae;
    --line: rgb(236 234 224 / 0.16); --hover: rgb(236 234 224 / 0.08); }
}
.wrap[hidden] { display: none; }
.chip {
  all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 12px 0 10px; border-radius: 12px;
  background: var(--ground); border: 1.5px solid var(--line);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  font-size: 13px; font-weight: 600; color: var(--ink);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
}
.chip svg { color: var(--accent); }
.chip:focus-visible, button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.menu {
  position: absolute; bottom: 40px; right: 0; width: 220px; padding: 6px;
  border-radius: 16px; background: var(--ground); border: 1.5px solid var(--line);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.2);
  max-height: 60vh; overflow: auto;
}
.menu[hidden] { display: none; }
.menu p { margin: 4px 8px 6px; font-size: 12px; color: var(--ink2); }
.menu button {
  all: unset; box-sizing: border-box; width: 100%; cursor: pointer;
  display: block; padding: 8px 10px; border-radius: 10px; font-size: 14px; font-weight: 600;
}
.menu button:hover, .menu button:focus-visible { background: var(--hover); }
`

export function mountComposeHelper(opts: {
  box: () => HTMLElement | null
  styles: () => { id: string; label: string }[]
  onPick: (p: ComposePick) => void
}) {
  const host = document.createElement('div')
  host.setAttribute('data-vendor-desk', 'compose')
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>${CSS}</style><div class="wrap" hidden>
    <div class="menu" role="menu" aria-label="Writing help" hidden></div>
    <button class="chip" type="button" aria-haspopup="menu" aria-expanded="false">${SPARK}<span>Desk</span></button>
  </div>`
  document.body.append(host)
  const wrap = root.querySelector<HTMLElement>('.wrap')!
  const chip = root.querySelector<HTMLButtonElement>('.chip')!
  const menu = root.querySelector<HTMLElement>('.menu')!

  // Sits just above the box's right end, clear of WhatsApp's send button.
  function place() {
    const box = opts.box()
    const r = box?.getBoundingClientRect()
    if (!box || !r || r.width === 0) {
      wrap.hidden = true
      return
    }
    wrap.hidden = false
    wrap.style.left = `${Math.round(r.right - 110)}px`
    wrap.style.top = `${Math.round(r.top - 44)}px`
    chip.querySelector('span')!.textContent = box.innerText.trim()
      ? 'Rewrite'
      : 'Draft'
  }

  function pick(p: ComposePick) {
    menu.hidden = true
    chip.setAttribute('aria-expanded', 'false')
    opts.onPick(p)
  }

  function open() {
    const text = opts.box()?.innerText.trim() ?? ''
    menu.replaceChildren()
    const button = (label: string, p: ComposePick) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('role', 'menuitem')
      b.textContent = label
      b.addEventListener('click', () => pick(p))
      menu.append(b)
    }
    if (!text) {
      const note = document.createElement('p')
      note.textContent = 'The desk writes from this chat and its facts.'
      menu.append(note)
      button('Draft a reply for me', { kind: 'draft' })
    } else {
      const note = document.createElement('p')
      note.textContent = 'Reword what you typed. Nothing is sent.'
      menu.append(note)
      for (const s of opts.styles()) {
        button(s.label, { kind: 'rewrite', style: s.id, text })
      }
    }
    menu.hidden = false
    chip.setAttribute('aria-expanded', 'true')
    menu.querySelector('button')?.focus()
  }

  chip.addEventListener('click', () => {
    if (menu.hidden) open()
    else {
      menu.hidden = true
      chip.setAttribute('aria-expanded', 'false')
    }
  })
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') {
      menu.hidden = true
      chip.setAttribute('aria-expanded', 'false')
      chip.focus()
    }
  })
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !e.composedPath().includes(host)) menu.hidden = true
  })

  // WhatsApp moves the box as the chat changes and as text wraps.
  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      place()
    })
  }
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  window.addEventListener('resize', schedule)
  document.addEventListener('input', schedule, true)
  place()
}
