import type { StyleChoice, WriteAnswer } from './bridge'
import { whereMarks, type Where } from './floatDesk'

// Writing help on WhatsApp itself. A small button on the message box offers
// a drafted reply when the box is empty, or the shop's rewrites when it is
// not; the same rewrites appear beside any text the vendor selects. A card
// above the box shows the work, the full cloud request before anything goes,
// and the result with a way back. Nothing is ever sent.

// Where the text came from, which decides where the result goes.
export type Source =
  | { from: 'box' }
  // Part of what is typed in the box.
  | { from: 'box-part' }
  // A message in the chat, or text from the clipboard: shown, not placed.
  | { from: 'chat' }

export type ComposePick =
  | { kind: 'draft' }
  | { kind: 'rewrite'; style: StyleChoice; text: string; source: Source }
  | { kind: 'meaning'; text: string }
  | { kind: 'clipboard' }

type Approval = Extract<WriteAnswer, { kind: 'approve' }>['request']

export type CardResult = {
  title: string
  where: Where
  ms: number
  // Shown when the text is not already in the box.
  text?: string
  warning?: string
  actions: { label: string; run: () => void | Promise<void> }[]
}

const SPARK =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5ZM18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/></svg>'
const CLOSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.layer {
  --ground: rgb(239 237 229 / 0.94); --ink: #1b1c18; --ink2: #4a4c44;
  --line: rgb(27 28 24 / 0.16); --accent: #e4703a; --hover: rgb(27 28 24 / 0.07);
  --well: rgb(27 28 24 / 0.05); --warn: #8a4a12;
  font: 14px/1.45 system-ui, 'Segoe UI', Roboto, sans-serif;
  color: var(--ink);
}
@media (prefers-color-scheme: dark) {
  .layer { --ground: rgb(28 29 25 / 0.95); --ink: #eceae0; --ink2: #b9b8ae;
    --line: rgb(236 234 224 / 0.16); --hover: rgb(236 234 224 / 0.08);
    --well: rgb(236 234 224 / 0.06); --warn: #f0b27a; }
}
.anchor { position: fixed; z-index: 2147483000; }
.anchor[hidden], [hidden] { display: none !important; }
.glass {
  background: var(--ground); border: 1.5px solid var(--line);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.chip {
  all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 12px 0 10px; border-radius: 12px;
  font-size: 13px; font-weight: 600; color: var(--ink);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
}
.chip svg { color: var(--accent); }
button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.menu, .card {
  position: absolute; right: 0; bottom: 40px; padding: 6px;
  border-radius: 16px; box-shadow: 0 12px 40px rgb(0 0 0 / 0.2);
}
.below .menu { bottom: auto; top: 40px; left: 0; right: auto; }
.menu { width: 230px; max-height: 60vh; overflow: auto; }
.menu p { margin: 4px 8px 6px; font-size: 12px; color: var(--ink2); }
.menu button {
  all: unset; box-sizing: border-box; width: 100%; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 10px; font-size: 14px; font-weight: 600;
}
.menu hr { border: 0; border-top: 1px solid var(--line); margin: 4px 6px; }
.where { display: flex; gap: 4px; margin-left: auto; color: var(--ink2); }
.menu button:hover, .menu button:focus-visible { background: var(--hover); }
.card { width: 340px; padding: 12px 14px 14px; max-height: 70vh; overflow: auto; }
.card header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.card h2 { all: unset; font-size: 14px; font-weight: 700; flex: 1; }
.card .x { all: unset; cursor: pointer; color: var(--ink2); display: flex; padding: 4px; border-radius: 8px; }
.card .x:hover { background: var(--hover); }
.card p { margin: 0 0 8px; font-size: 13px; color: var(--ink2); }
.card .meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink2); }
.card .meta .where { margin-left: 0; }
.card pre {
  margin: 0 0 8px; padding: 8px 10px; border-radius: 10px; background: var(--well);
  font: 12.5px/1.45 ui-monospace, monospace; white-space: pre-wrap; word-break: break-word;
  max-height: 180px; overflow: auto; color: var(--ink);
}
.card .text { margin: 0 0 8px; padding: 8px 10px; border-radius: 10px; background: var(--well);
  font-size: 14px; color: var(--ink); white-space: pre-wrap; }
.card .warn { color: var(--warn); }
.card .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.card .row button {
  all: unset; cursor: pointer; padding: 6px 12px; border-radius: 10px;
  border: 1.5px solid var(--line); font-size: 13px; font-weight: 600;
}
.card .row button:hover { background: var(--hover); }
.card .row button.go { background: var(--ink); color: var(--ground); border-color: var(--ink); }
.dots::after { content: '…'; animation: blink 1.2s steps(3, end) infinite; }
@keyframes blink { 0% { opacity: .2 } 50% { opacity: 1 } 100% { opacity: .2 } }
@media (prefers-reduced-motion: reduce) { .dots::after { animation: none; } }
`

export function mountComposeHelper(opts: {
  box: () => HTMLElement | null
  // Selected text counts only inside the open chat.
  chatArea: () => HTMLElement | null
  styles: () => StyleChoice[]
  onPick: (p: ComposePick) => void
  onOpenDesk: () => void
}) {
  const host = document.createElement('div')
  host.setAttribute('data-vendor-desk', 'compose')
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>${CSS}</style><div class="layer">
    <div class="anchor box" hidden>
      <div class="menu glass" role="group" aria-label="Writing help" hidden></div>
      <section class="card glass" role="status" aria-live="polite" hidden></section>
      <button class="chip glass" type="button" aria-expanded="false">${SPARK}<span>Foil</span></button>
    </div>
    <div class="anchor sel below" hidden>
      <button class="chip glass" type="button" aria-expanded="false">${SPARK}<span>Rewrite</span></button>
      <div class="menu glass" role="group" aria-label="Rewrite the selected text" hidden></div>
    </div>
  </div>`
  document.body.append(host)
  const boxAnchor = root.querySelector<HTMLElement>('.anchor.box')!
  const boxChip = boxAnchor.querySelector<HTMLButtonElement>('.chip')!
  const boxMenu = boxAnchor.querySelector<HTMLElement>('.menu')!
  const card = boxAnchor.querySelector<HTMLElement>('.card')!
  const selAnchor = root.querySelector<HTMLElement>('.anchor.sel')!
  const selChip = selAnchor.querySelector<HTMLButtonElement>('.chip')!
  const selMenu = selAnchor.querySelector<HTMLElement>('.menu')!

  // The selection as it was when the chip appeared: clicking the chip can
  // clear the page's own selection.
  let selected: { text: string; inBox: boolean } | null = null

  function closeMenus() {
    for (const [menu, chip] of [
      [boxMenu, boxChip],
      [selMenu, selChip],
    ] as const) {
      menu.hidden = true
      chip.setAttribute('aria-expanded', 'false')
    }
  }

  // Sits just above the box's right end, clear of WhatsApp's send button.
  function place() {
    const box = opts.box()
    const r = box?.getBoundingClientRect()
    if (!box || !r || r.width === 0) {
      boxAnchor.hidden = true
      return
    }
    boxAnchor.hidden = false
    boxAnchor.style.left = `${Math.round(r.right - 110)}px`
    boxAnchor.style.top = `${Math.round(r.top - 44)}px`
    boxChip.querySelector('span')!.textContent = box.innerText.trim()
      ? 'Rewrite'
      : 'Draft'
  }

  function button(
    menu: HTMLElement,
    label: string,
    where: Where[],
    run: () => void,
  ) {
    const b = document.createElement('button')
    b.type = 'button'
    const text = document.createElement('span')
    text.textContent = label
    b.append(text, whereMarks(where))
    b.addEventListener('click', () => {
      closeMenus()
      selAnchor.hidden = true
      run()
    })
    menu.append(b)
  }

  function note(menu: HTMLElement, text: string) {
    const p = document.createElement('p')
    p.textContent = text
    menu.append(p)
  }

  function styleButtons(menu: HTMLElement, text: string, source: Source) {
    for (const s of opts.styles()) {
      button(menu, s.label, [s.onDevice ? 'device' : 'cloud'], () =>
        opts.onPick({ kind: 'rewrite', style: s, text, source }),
      )
    }
  }

  function openMenu(menu: HTMLElement, chip: HTMLButtonElement) {
    closeMenus()
    menu.hidden = false
    chip.setAttribute('aria-expanded', 'true')
    menu.querySelector('button')?.focus()
  }

  function openBoxMenu() {
    const text = opts.box()?.innerText.trim() ?? ''
    boxMenu.replaceChildren()
    if (!text) {
      note(boxMenu, 'Foil writes from this chat and its facts.')
      button(boxMenu, 'Draft a reply for me', ['device'], () =>
        opts.onPick({ kind: 'draft' }),
      )
      boxMenu.append(document.createElement('hr'))
      button(boxMenu, 'Rewrite what I copied', ['device', 'cloud'], () =>
        opts.onPick({ kind: 'clipboard' }),
      )
    } else {
      note(boxMenu, 'Reword what you typed. Nothing is sent.')
      styleButtons(boxMenu, text, { from: 'box' })
    }
    openMenu(boxMenu, boxChip)
  }

  function openSelMenu() {
    if (!selected) return
    const { text, inBox } = selected
    selMenu.replaceChildren()
    if (inBox) {
      note(selMenu, 'Reword the part you selected. Nothing is sent.')
      styleButtons(selMenu, text, { from: 'box-part' })
    } else {
      note(selMenu, 'The result is shown here for you to copy or use.')
      button(selMenu, 'What it means in English', ['device', 'cloud'], () =>
        opts.onPick({ kind: 'meaning', text }),
      )
      selMenu.append(document.createElement('hr'))
      styleButtons(selMenu, text, { from: 'chat' })
    }
    openMenu(selMenu, selChip)
  }

  // Shows the vendor's choices for text from outside the box, such as the
  // clipboard, in the box's own menu.
  function offer(text: string) {
    boxMenu.replaceChildren()
    note(boxMenu, 'Reword what you copied. The result is shown here.')
    styleButtons(boxMenu, text, { from: 'chat' })
    openMenu(boxMenu, boxChip)
  }

  boxChip.addEventListener('click', () => {
    if (boxMenu.hidden) openBoxMenu()
    else closeMenus()
  })
  selChip.addEventListener('click', () => {
    if (selMenu.hidden) openSelMenu()
    else closeMenus()
  })
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return
    if (!boxMenu.hidden || !selMenu.hidden) {
      closeMenus()
      boxChip.focus()
    } else if (!card.hidden) {
      // The same as the close button, which also declines an approval.
      card.querySelector<HTMLButtonElement>('.x')?.click()
    }
  })
  document.addEventListener('pointerdown', (e) => {
    if (e.composedPath().includes(host)) return
    closeMenus()
  })

  // A selection of a few characters or more, inside the open chat.
  function readSelection() {
    const sel = document.getSelection()
    const text = sel?.toString().trim() ?? ''
    const node = sel?.anchorNode ?? null
    const area = opts.chatArea()
    if (
      !sel ||
      sel.isCollapsed ||
      text.length < 3 ||
      !node ||
      !area?.contains(node)
    ) {
      if (selMenu.hidden) selAnchor.hidden = true
      return
    }
    const box = opts.box()
    const inBox = Boolean(box?.contains(node))
    // All of the box selected is the same as the box's own button.
    if (inBox && text === box?.innerText.trim()) {
      selAnchor.hidden = true
      return
    }
    const r = sel.getRangeAt(0).getBoundingClientRect()
    selected = { text, inBox }
    selAnchor.hidden = false
    const below = r.bottom + 48 < window.innerHeight
    selAnchor.classList.toggle('below', below)
    selAnchor.style.left = `${Math.round(Math.min(r.left, window.innerWidth - 250))}px`
    selAnchor.style.top = `${Math.round(below ? r.bottom + 6 : r.top - 40)}px`
  }
  let selTimer = 0
  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer)
    selTimer = window.setTimeout(readSelection, 250)
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

  // The card above the box.
  function showCard(title: string, fill: (body: HTMLElement) => void) {
    card.replaceChildren()
    const header = document.createElement('header')
    const h = document.createElement('h2')
    h.textContent = title
    const x = document.createElement('button')
    x.type = 'button'
    x.className = 'x'
    x.innerHTML = CLOSE
    x.setAttribute('aria-label', 'Close')
    x.addEventListener('click', () => (card.hidden = true))
    header.append(h, x)
    card.append(header)
    fill(card)
    card.hidden = false
  }

  const para = (text: string, cls?: string) => {
    const p = document.createElement('p')
    p.textContent = text
    if (cls) p.className = cls
    return p
  }

  function row(
    actions: { label: string; run: () => void | Promise<void>; go?: boolean }[],
  ) {
    const div = document.createElement('div')
    div.className = 'row'
    for (const a of actions) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = a.label
      if (a.go) b.className = 'go'
      b.addEventListener('click', () => void a.run())
      div.append(b)
    }
    return div
  }

  return {
    offer,
    busy(title: string, where: Where) {
      showCard(title, (body) => {
        const p = para('', 'meta')
        const working = document.createElement('span')
        working.className = 'dots'
        working.textContent =
          where === 'device' ? 'Writing on this computer' : 'Writing'
        p.append(whereMarks([where]), working)
        body.append(p)
      })
    },
    // Resolves true only on the vendor's click on Send.
    approve(request: Approval): Promise<boolean> {
      return new Promise((resolve) => {
        showCard(request.feature, (body) => {
          body.append(para(request.reason))
          body.append(para("Sent to Google's Gemini service, exactly:"))
          for (const t of request.texts) {
            const pre = document.createElement('pre')
            pre.textContent = t
            body.append(pre)
          }
          if (request.replaced.length) {
            body.append(
              para(
                `Swapped out before sending: ${request.replaced.join(', ')}.`,
              ),
            )
          }
          body.append(
            row([
              {
                label: 'Send',
                go: true,
                run: () => {
                  card.hidden = true
                  resolve(true)
                },
              },
              {
                label: 'Cancel',
                run: () => {
                  card.hidden = true
                  resolve(false)
                },
              },
            ]),
          )
          // Closing the card is a no.
          card
            .querySelector('.x')
            ?.addEventListener('click', () => resolve(false))
        })
        card.querySelector<HTMLButtonElement>('.go')?.focus()
      })
    },
    result(r: CardResult) {
      showCard(r.title, (body) => {
        if (r.text) {
          const t = document.createElement('div')
          t.className = 'text'
          t.textContent = r.text
          body.append(t)
        }
        if (r.warning) body.append(para(r.warning, 'warn'))
        const meta = document.createElement('p')
        meta.className = 'meta'
        meta.append(whereMarks([r.where]), `${(r.ms / 1000).toFixed(1)} s`)
        body.append(meta)
        if (r.actions.length) body.append(row(r.actions))
      })
    },
    error(message: string, openDesk = false) {
      showCard('Writing help', (body) => {
        body.append(para(message, 'warn'))
        if (openDesk) {
          body.append(
            row([
              {
                label: 'Open Foil',
                go: true,
                run: () => {
                  card.hidden = true
                  opts.onOpenDesk()
                },
              },
            ]),
          )
        }
      })
    },
    close() {
      card.hidden = true
    },
  }
}
