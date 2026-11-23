import type { Market } from './market'

// The languages the owner may speak to the desk in, from the shop's market,
// best first. Chrome's on-device packs cover some English variants and not
// others, so nearby ones are tried too.
export function speechLangs(locale: string): string[] {
  return locale.startsWith('en-')
    ? [...new Set([locale, 'en-GB', 'en-US'])]
    : [locale]
}

// The languages the desk can answer in, per market. Chrome's built-in model
// writes English and English-based Pidgin; the rest are written in the cloud.
export type AnswerLanguage = {
  id: string
  label: string
  // How prompts name it.
  prompt: string
  onDevice: boolean
  // For choosing a voice to read it aloud.
  voiceLang: string
}

export function answerLanguages(m: Market): AnswerLanguage[] {
  const l = (
    id: string,
    label: string,
    prompt: string,
    onDevice: boolean,
    voiceLang: string,
  ): AnswerLanguage => ({ id, label, prompt, onDevice, voiceLang })
  if (m.id === 'in') {
    return [
      l('english', 'English', 'English', true, 'en-IN'),
      l('hindi', 'Hindi', 'Hindi, in Devanagari script', false, 'hi-IN'),
    ]
  }
  if (m.id === 'br') {
    return [
      l('portuguese', 'Portuguese', 'Brazilian Portuguese', false, 'pt-BR'),
      l('english', 'English', 'English', true, 'en-US'),
    ]
  }
  return [
    l('english', 'English', 'English', true, 'en-NG'),
    l('pidgin', 'Pidgin', 'natural Lagos Nigerian Pidgin', true, 'en-NG'),
    l('yoruba', 'Yoruba', 'Yoruba, with correct tone marks', false, 'yo-NG'),
    l('igbo', 'Igbo', 'Igbo', false, 'ig-NG'),
    l('hausa', 'Hausa', 'Hausa', false, 'ha-NG'),
  ]
}

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

// The voice to read an answer in: the vendor's pick if it still exists, else
// one for that exact language (on this computer first), else one for the
// same language anywhere. Null when no voice speaks it, so the desk says so
// rather than reading Yoruba in an English voice.
export function pickVoice(
  voices: VoiceInfo[],
  lang: string,
  preferred: string,
): VoiceInfo | null {
  const chosen = voices.find((v) => v.name === preferred)
  if (chosen) return chosen
  const norm = (s: string) => s.replace('_', '-').toLowerCase()
  const base = norm(lang).split('-')[0]
  const exact = voices.filter((v) => norm(v.lang) === norm(lang))
  const same = voices.filter((v) => norm(v.lang).split('-')[0] === base)
  const local = (vs: VoiceInfo[]) => vs.find((v) => v.localService) ?? vs[0]
  return local(exact) ?? local(same) ?? null
}
