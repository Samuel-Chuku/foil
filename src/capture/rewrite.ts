import type { Market } from '../config/market'
import { writesPidgin } from './draft'

// Writing help for the vendor's own reply in the message box, and English
// for a customer's message. The vendor's words are only reworded: every
// amount, number, name and promise must survive, and the code checks that
// it did rather than trusting the model.

export type RewriteStyle = {
  id: string
  label: string
  // What the model is asked to do.
  instruction: string
  // Run on this computer when it can; languages the device model cannot
  // write go to the cloud, after approval.
  onDevice: boolean
  // For the approval dialog, the language named.
  language?: string
}

const TONES: RewriteStyle[] = [
  {
    id: 'friendlier',
    label: 'Friendlier',
    instruction: 'Make it warmer and friendlier, still short.',
    onDevice: true,
  },
  {
    id: 'formal',
    label: 'More formal',
    instruction: 'Make it polite and a little formal, with no slang.',
    onDevice: true,
  },
  {
    id: 'shorter',
    label: 'Shorter',
    instruction: 'Make it shorter and plainer, keeping every fact.',
    onDevice: true,
  },
  {
    id: 'spelling',
    label: 'Fix spelling',
    instruction:
      'Fix spelling, grammar and punctuation only. Keep the wording, the language and the tone.',
    onDevice: true,
  },
]

const lang = (
  id: string,
  label: string,
  language: string,
  onDevice: boolean,
): RewriteStyle => ({
  id,
  label,
  instruction: `Write it in ${language}, the way a shop texts a customer.`,
  onDevice,
  language,
})

// The languages a shop in each market switches between. Chrome's built-in
// model writes English (and English-based Pidgin); the rest go to the cloud.
export function rewriteStyles(m: Market): RewriteStyle[] {
  // The device cannot write Portuguese, so São Paulo's tones run in the cloud.
  const tones = TONES.map((t) => ({ ...t, onDevice: m.reply.onDevice }))
  if (m.id === 'in') {
    return [
      ...tones,
      lang('english', 'In English', 'plain English', true),
      lang('hindi', 'In Hindi', 'Hindi, in Devanagari script', false),
    ]
  }
  if (m.id === 'br') {
    return [
      ...tones.map((t) => ({ ...t, language: 'Brazilian Portuguese' })),
      lang('portuguese', 'In Portuguese', 'Brazilian Portuguese', false),
      lang('english', 'In English', 'plain English', true),
    ]
  }
  return [
    ...tones,
    lang('pidgin', 'In Pidgin', 'natural Lagos Nigerian Pidgin', true),
    lang('english', 'In English', 'plain Nigerian English', true),
    lang('yoruba', 'In Yoruba', 'Yoruba, with correct tone marks', false),
    lang('igbo', 'In Igbo', 'Igbo', false),
    lang('hausa', 'In Hausa', 'Hausa', false),
  ]
}

export function rewritePrompt(
  text: string,
  style: RewriteStyle,
  m: Market,
  keep: string[] = [],
): string {
  return [
    `Rewrite this WhatsApp message that a small ${m.city} shop is about to send a customer. ${style.instruction}`,
    'Keep every amount, number, date, time, name, place and promise exactly as written, and add nothing new: no facts, prices, fees or promises. A marker such as ⟦1⟧ stands for a name or number: copy each one exactly where it belongs, and add no other brackets.',
    ...(keep.length
      ? [`These numbers must appear exactly as written: ${keep.join(', ')}.`]
      : []),
    'Output only the rewritten message.',
    `Message:\n${text}`,
  ].join('\n\n')
}

// Every run of digits, with thousands separators taken out, so "₦18,500"
// and "18500" count as the same number.
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,.\s]*\d|\d/g) ?? [])
    .map((n) => n.replace(/[,\s]/g, '').replace(/\.0+$/, ''))
    .filter(Boolean)
}

// Numbers the original has that the rewrite lost or changed.
export function lostNumbers(original: string, rewritten: string): string[] {
  const after = numbersIn(rewritten)
  return [...new Set(numbersIn(original))].filter((n) => !after.includes(n))
}

// Names, phone and account numbers swapped for ⟦1⟧, ⟦2⟧… before a cloud
// call, and put back in the answer, so a rewrite in Yoruba still carries the
// real name and number without the cloud ever seeing them.
const SENSITIVE: { re: RegExp; what: string }[] = [
  { re: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, what: 'email addresses' },
  { re: /\b\d{10,}\b/g, what: 'account and phone numbers' },
  {
    re: /(\+?234[\s-]?|\b0)[789][01]\d([\s-]?\d){7}\b/g,
    what: 'account and phone numbers',
  },
]

export function protect(
  text: string,
  names: string[],
): { text: string; restore: (out: string) => string; replaced: string[] } {
  const kept: string[] = []
  const replaced = new Set<string>()
  const swap = (s: string) => {
    kept.push(s)
    return `⟦${kept.length}⟧`
  }
  let out = text
  for (const p of SENSITIVE) {
    out = out.replace(p.re, (m) => {
      replaced.add(p.what)
      return swap(m)
    })
  }
  const words = [
    ...new Set(names.flatMap((n) => [n.trim(), ...n.trim().split(/\s+/)])),
  ]
    .filter((n) => n.length > 2)
    .sort((a, b) => b.length - a.length)
  for (const n of words) {
    const re = new RegExp(
      `(?<![\\p{L}\\d])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`,
      'giu',
    )
    out = out.replace(re, (m) => {
      replaced.add('names')
      return swap(m)
    })
  }
  return {
    text: out,
    replaced: [...replaced],
    // A marker comes back as what it stood for; any other bracket the
    // model added is dropped.
    restore: (answer) =>
      answer
        .replace(/⟦(\d+)⟧/g, (whole, i: string) => kept[Number(i) - 1] ?? whole)
        .replace(/[⟦⟧]/g, ''),
  }
}

// Common English and Pidgin words. A message mostly made of them can be put
// into plain English on this computer; anything else goes to the cloud,
// after approval.
const COMMON = new Set(
  `a about abeg after again all am an and any are as at be because been
  but by can come could day dey did do does don for from get give go good
  had has have he her here him his how i if in is it its just know like
  make me money more much my na no not now of on one only or our out
  please pay paid send sent she so some that the their them then there
  they this to today tomorrow una up us want was we well wetin what when
  where which who will with would yes you your how far fit go abi o oh
  ok okay thanks thank sir ma madam price much available still size`
    .split(/\s+/)
    .filter(Boolean),
)

export function readsAsEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length === 0) return true
  const known = words.filter((w) => COMMON.has(w)).length
  return known / words.length >= 0.3 || writesPidgin(`Customer: ${text}`)
}

export function translatePrompt(lines: string[]): string {
  return [
    "Put these WhatsApp messages from a shop's customer into plain English, one line for each message, in order. Keep amounts, numbers and sizes exactly, and copy each marker such as ⟦1⟧ as it is. Do not answer them; only say what they mean.",
    `Messages:\n${lines.map((l) => `- ${l}`).join('\n')}`,
  ].join('\n\n')
}
