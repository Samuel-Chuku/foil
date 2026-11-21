// Runs in WhatsApp Web's own page, where its audio player lives. WhatsApp
// plays a voice note from a hidden player whose blob address exists only
// once the vendor has pressed play. This notes which message each address
// belongs to, and hands an address over only when the desk's own content
// script asks for one message on the vendor's click. It reads nothing else
// and changes nothing on the page.

// Wrapped so nothing is left on the page's own globals.
;(() => {
  const TAG = 'vendor-desk-voice'
  const played = new Map<string, string>()

  const media = HTMLMediaElement.prototype
  const play = media.play
  media.play = function (this: HTMLMediaElement) {
    const src = this.currentSrc || this.src
    // The note now showing a pause button is the one that started.
    setTimeout(() => {
      const row = [...document.querySelectorAll('#main [data-id]')].find((r) =>
        r.querySelector('button[aria-label="Pause voice message"]'),
      )
      const id = row?.getAttribute('data-id')
      if (id && src.startsWith('blob:')) played.set(id, src)
    }, 300)
    return play.apply(this)
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return
    const m = e.data as { tag?: string; ask?: string } | null
    if (m?.tag !== TAG || typeof m.ask !== 'string') return
    window.postMessage({ tag: TAG, id: m.ask, src: played.get(m.ask) ?? null })
  })
})()
