// Runs in WhatsApp Web's own page, where its audio player lives. A voice
// note's audio exists in the page only once the vendor presses play. This
// notes which note's play button the vendor pressed, keeps the audio the
// page then makes for it, by whichever route WhatsApp takes (a blob address,
// an audio element, Web Audio decoding, or decoded sound played through Web
// Audio), and hands it over only when the desk's own content script asks for
// that one message on the vendor's click. It reads nothing else and changes
// nothing on the page.

// Wrapped so nothing is left on the page's own globals.
;(() => {
  const TAG = 'vendor-desk-voice'
  // Audio arriving this soon after a press belongs to that note.
  const WINDOW_MS = 10_000
  const MIN_BYTES = 512

  type Note = {
    // The note's file, when the page handled one.
    file: Blob | null
    // Sound the page played through Web Audio, in order.
    sound: AudioBuffer[]
  }
  // By the message's id as the desk's floating menu reads it: the first id
  // in the message's row. WhatsApp redraws rows, so elements are not kept.
  const notes = new Map<string, Note>()
  let pressed: { id: string; at: number } | null = null

  const idOf = (el: Element | null): string | null =>
    el
      ?.closest('[role="row"]')
      ?.querySelector('[data-id]')
      ?.getAttribute('data-id') ??
    el?.closest('[data-id]')?.getAttribute('data-id') ??
    null

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null
      const button = target?.closest?.('button, [role="button"]')
      const label = button?.getAttribute('aria-label') ?? ''
      if (!button || !/play/i.test(label)) return
      const id = idOf(button)
      if (id) pressed = { id, at: Date.now() }
    },
    true,
  )

  const current = (): Note | null => {
    if (!pressed || Date.now() - pressed.at > WINDOW_MS) return null
    let note = notes.get(pressed.id)
    if (!note) {
      note = { file: null, sound: [] }
      notes.set(pressed.id, note)
    }
    return note
  }

  const keepFile = (blob: Blob) => {
    const note = current()
    if (note && !note.file && blob.size >= MIN_BYTES) note.file = blob
  }

  // Route 1: the audio is turned into a blob address for a player.
  const createObjectURL = URL.createObjectURL.bind(URL)
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = createObjectURL(obj)
    if (obj instanceof Blob && !/^(image|video|text)\//.test(obj.type)) {
      keepFile(obj)
    }
    return url
  }

  // Route 2: an audio element plays an address made elsewhere, sometimes
  // set only after play() is called, so it is read once playing starts.
  const fetchSource = (el: HTMLMediaElement) => {
    const src = el.currentSrc || el.src
    const note = current()
    if (!note || note.file || !/^(blob|data|https):/.test(src)) return
    void fetch(src)
      .then((r) => r.blob())
      .then((b) => {
        if (!note.file && b.size >= MIN_BYTES) note.file = b
      })
      .catch(() => undefined)
  }
  const media = HTMLMediaElement.prototype
  const play = media.play
  media.play = function (this: HTMLMediaElement) {
    if (current()) {
      this.addEventListener('playing', () => fetchSource(this), { once: true })
    }
    return play.apply(this)
  }

  // Route 3: the audio file is decoded for Web Audio. The bytes are copied
  // first, since decoding hands the original buffer over.
  const decode = BaseAudioContext.prototype.decodeAudioData
  BaseAudioContext.prototype.decodeAudioData = function (
    this: BaseAudioContext,
    data: ArrayBuffer,
    ...rest: [DecodeSuccessCallback?, DecodeErrorCallback?]
  ) {
    try {
      keepFile(new Blob([data.slice(0)], { type: 'audio/ogg' }))
    } catch {
      // A buffer that cannot be copied is left alone.
    }
    return decode.call(this, data, ...rest)
  }

  // Route 4: sound already decoded by the page's own code and played
  // through Web Audio. Kept as played and turned into a WAV file on request.
  const start = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (
    this: AudioBufferSourceNode,
    ...args: [number?, number?, number?]
  ) {
    const note = current()
    if (note && this.buffer && note.sound.length < 2000) {
      note.sound.push(this.buffer)
    }
    return start.apply(this, args)
  }

  // Joins the played pieces into one 16-bit mono WAV file.
  function wav(pieces: AudioBuffer[]): Blob | null {
    const rate = pieces[0]?.sampleRate
    if (!rate) return null
    const same = pieces.filter((p) => p.sampleRate === rate)
    const length = same.reduce((n, p) => n + p.length, 0)
    if (length < rate / 2) return null
    const out = new DataView(new ArrayBuffer(44 + length * 2))
    const text = (at: number, s: string) => {
      for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i))
    }
    text(0, 'RIFF')
    out.setUint32(4, 36 + length * 2, true)
    text(8, 'WAVEfmt ')
    out.setUint32(16, 16, true)
    out.setUint16(20, 1, true)
    out.setUint16(22, 1, true)
    out.setUint32(24, rate, true)
    out.setUint32(28, rate * 2, true)
    out.setUint16(32, 2, true)
    out.setUint16(34, 16, true)
    text(36, 'data')
    out.setUint32(40, length * 2, true)
    let at = 44
    for (const p of same) {
      const channels = Array.from({ length: p.numberOfChannels }, (_, c) =>
        p.getChannelData(c),
      )
      for (let i = 0; i < p.length; i++) {
        let sum = 0
        for (const ch of channels) sum += ch[i] ?? 0
        const v = Math.max(-1, Math.min(1, sum / channels.length))
        out.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true)
        at += 2
      }
    }
    return new Blob([out.buffer], { type: 'audio/wav' })
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return
    const m = e.data as { tag?: string; ask?: string } | null
    if (m?.tag !== TAG || typeof m.ask !== 'string') return
    const holder = document.querySelector(`[data-id="${CSS.escape(m.ask)}"]`)
    const note = notes.get(m.ask) ?? notes.get(idOf(holder) ?? '')
    window.postMessage({
      tag: TAG,
      id: m.ask,
      blob: note?.file ?? (note ? wav(note.sound) : null),
      // Whether that note's press was seen at all, so the desk can say what
      // to do next.
      seen: Boolean(note),
    })
  })
})()
