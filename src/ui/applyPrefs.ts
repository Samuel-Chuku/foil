import { prefsStore, resolvedTheme, type Prefs } from './prefs'

// Draws the vendor's appearance settings onto the page: the theme, accent,
// density and section colours as attributes the tokens key off, and the
// text size as a zoom on the panel. "System" follows the browser live.
function apply(p: Prefs, systemDark: boolean) {
  const root = document.documentElement
  root.dataset.theme = resolvedTheme(p.theme, systemDark)
  root.dataset.accent = p.accent
  root.dataset.density = p.density
  root.dataset.tones = p.sectionColours ? 'on' : 'off'
  root.style.setProperty('--dk-zoom', String(p.textScale / 100))
}

export function startPrefs(): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const draw = () => apply(prefsStore.get(), dark.matches)
  draw()
  dark.addEventListener('change', draw)
  prefsStore.subscribe(draw)
}
