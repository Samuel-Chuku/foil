import type { Market } from './market'

// The languages the owner may speak to the desk in, from the shop's market,
// best first. Chrome's on-device packs cover some English variants and not
// others, so nearby ones are tried too.
export function speechLangs(locale: string): string[] {
  return locale.startsWith('en-')
    ? [...new Set([locale, 'en-GB', 'en-US'])]
    : [locale]
}

// The languages the desk can answer in (see Market.answerIn).
export type AnswerLanguage = Market['answerIn'][number]

export const answerLanguages = (m: Market): AnswerLanguage[] => m.answerIn

// The language chosen in Settings, or the market's own when none is.
export function answerLanguage(m: Market, id: string): AnswerLanguage {
  const all = answerLanguages(m)
  return all.find((x) => x.id === id) ?? all[0]!
}

// An answer as it should be said: amounts with the currency spoken after
// the number, order numbers as "order 77", no list marks.
export function speakable(text: string, m: Market): string {
  const unit = { NGN: 'naira', INR: 'rupees', BRL: 'reais' }[m.currency.code]
  const symbol = m.currency.symbol.replace(/[$]/g, '\\$')
  return text
    .replace(
      new RegExp(`${symbol}\\s?(\\d[\\d.,]*\\d|\\d)`, 'g'),
      `$1 ${unit ?? ''}`,
    )
    .replace(/\b(order)\s+#(\d+)/gi, '$1 $2')
    .replace(/#(\d+)/g, 'order $1')
    .replace(/[*_`•]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

export type VoiceInfo = { name: string; lang: string; localService: boolean }

// The synthetic voices Linux ships (eSpeak and its kin), which sound robotic.
export const soundsBasic = (v: VoiceInfo): boolean =>
  /espeak|mbrola|festival|pico\b/i.test(v.name)

// A voice's language as two letters, or '' when the voice does not say.
// Chrome on Linux often lists the computer's own voices with no language,
// or a three-letter one.
const baseOf = (lang: string): string => {
  const b = lang.toLowerCase().split(/[-_]/)[0] ?? ''
  return b === 'eng' ? 'en' : /^[a-z]{2}$/.test(b) ? b : ''
}

// The voices that can read a language, as the Voice setting lists them. A
// voice on this computer that gives no language is kept for English and
// English-based Pidgin, which such voices speak by default; it is never
// offered for Yoruba, Igbo or Hausa.
export function voicesFor(
  voices: VoiceInfo[],
  lang: string,
): { local: VoiceInfo[]; online: VoiceInfo[] } {
  const base = baseOf(lang)
  const fits = (v: VoiceInfo) =>
    baseOf(v.lang) === base ||
    (base === 'en' && v.localService && baseOf(v.lang) === '')
  const all = voices.filter(fits)
  return {
    local: all.filter((v) => v.localService),
    online: all.filter((v) => !v.localService),
  }
}

// The voice to read an answer in: the vendor's pick if it still exists,
// else one on this computer (a natural one before a basic one, the exact
// language before a near one), and only then an online voice, since that
// sends the words to Google. Null when no voice speaks the language, so the
// desk says so rather than reading Yoruba in an English voice.
export function pickVoice(
  voices: VoiceInfo[],
  lang: string,
  preferred: string,
): VoiceInfo | null {
  const chosen = voices.find((v) => v.name === preferred)
  if (chosen) return chosen
  const norm = (s: string) => s.replace('_', '-').toLowerCase()
  const { local, online } = voicesFor(voices, lang)
  const exactFirst = (vs: VoiceInfo[]) => [
    ...vs.filter((v) => norm(v.lang) === norm(lang)),
    ...vs.filter((v) => norm(v.lang) !== norm(lang)),
  ]
  const here = exactFirst(local)
  return (
    here.find((v) => !soundsBasic(v)) ??
    here[0] ??
    exactFirst(online)[0] ??
    null
  )
}
