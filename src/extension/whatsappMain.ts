// Runs in WhatsApp Web's own page, where its audio player lives. A voice
// note's audio exists in the page only once the vendor presses play. This
// notes which note's play button the vendor pressed, keeps the audio the
// page then makes for it, by whichever route WhatsApp takes (an audio
// element, a blob address, or Web Audio decoding), and hands it over only
// when the desk's own content script asks for that one message on the
// vendor's click. It reads nothing else and changes nothing on the page.

// Wrapped so nothing is left on the page's own globals.
;(() => {
  const TAG = 'vendor-desk-voice'
  const played = new Map<string, Blob>()
  // The note whose play button was pressed last, and when.
  let pressed: { id: string; at: number } | null = null
  // Audio arriving this soon after a press belongs to that note.
  const WINDOW_MS = 8000

  const rowId = (el: Element): string | null => {
    const holder =
      el.closest('[data-id]') ??
      el.closest('[role="row"]')?.querySelector('[data-id]')
    return holder?.getAttribute('data-id') ?? null
  }

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null
      const button = target?.closest?.('button, [role="button"]')
      const label = button?.getAttribute('aria-label') ?? ''
      if (!button || !/play/i.test(label)) return
      const id = rowId(button)
      if (id) pressed = { id, at: Date.now() }
    },
    true,
  )

  const keep = (blob: Blob) => {
    if (!pressed || Date.now() - pressed.at > WINDOW_MS) return
    if (blob.size < 512) return
    played.set(pressed.id, blob)
  }

  // Route 1: the audio is turned into a blob address for a player.
  const createObjectURL = URL.createObjectURL.bind(URL)
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = createObjectURL(obj)
    if (obj instanceof Blob && !/^image|^video/.test(obj.type)) keep(obj)
    return url
  }

  // Route 2: an audio element plays an address made elsewhere.
  const media = HTMLMediaElement.prototype
  const play = media.play
  media.play = function (this: HTMLMediaElement) {
    const src = this.currentSrc || this.src
    if (pressed && Date.now() - pressed.at < WINDOW_MS && src) {
      const id = pressed.id
      void fetch(src)
        .then((r) => r.blob())
        .then((b) => {
          if (!played.has(id) && b.size >= 512) played.set(id, b)
        })
        .catch(() => undefined)
    }
    return play.apply(this)
  }

  // Route 3: the audio is decoded for Web Audio. The bytes are copied first,
  // since decoding hands the original buffer over.
  const decode = BaseAudioContext.prototype.decodeAudioData
  BaseAudioContext.prototype.decodeAudioData = function (
    this: BaseAudioContext,
    data: ArrayBuffer,
    ...rest: [DecodeSuccessCallback?, DecodeErrorCallback?]
  ) {
    try {
      keep(new Blob([data.slice(0)], { type: 'audio/ogg' }))
    } catch {
      // A buffer that cannot be copied is left alone.
    }
    return decode.call(this, data, ...rest)
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return
    const m = e.data as { tag?: string; ask?: string } | null
    if (m?.tag !== TAG || typeof m.ask !== 'string') return
    window.postMessage({
      tag: TAG,
      id: m.ask,
      blob: played.get(m.ask) ?? null,
      // Whether any note was caught at all, so the desk can say what to do.
      seen: played.size > 0 || pressed !== null,
    })
  })
})()
