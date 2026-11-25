import { market } from '../config/market'
import type { RawOrder } from './orderFields'

// A voice note is heard in the cloud (the on-device model takes no audio).
// The answer is the order's fields plus a short English gloss, never a
// verbatim transcript, and the fields the model could not make out.

export const VOICE_FIELDS = [
  'customerName',
  'address',
  'landmark',
  'area',
  'deliveryChoice',
  'state',
  'park',
  'payOnDelivery',
  'question',
  'gloss',
  'language',
] as const

// Only what changes the order counts as unclear: a doubt about the park they
// asked for, or the language, is not something to ask the customer about.
const UNSURE_NAMES = [
  'items',
  'quantity',
  'address',
  'area',
  'state',
  'landmark',
]

// Well-known Lagos streets, so a half-heard name is written the way people
// spell it. Public place names only.
export const LAGOS_STREETS = [
  'Adeniran Ogunsanya Street',
  'Bode Thomas Street',
  'Adeola Odeku Street',
  'Ahmadu Bello Way',
  'Akin Adesola Street',
  'Admiralty Way',
  'Allen Avenue',
  'Awolowo Road',
  'Herbert Macaulay Way',
  'Ikorodu Road',
  'Ogunlana Drive',
  'Opebi Road',
  'Toyin Street',
  'Obafemi Awolowo Way',
  'Isaac John Street',
  'Ozumba Mbadiwe Avenue',
  'Lekki-Epe Expressway',
  'Agege Motor Road',
  'Funsho Williams Avenue',
  'Western Avenue',
  'Hughes Avenue',
  'Commercial Avenue',
  'Akerele Street',
  'Ojuelegba Road',
  'Aguda Road',
  'Itire Road',
]

export type VoiceNote = {
  order: RawOrder
  // What the customer asked, in English, or empty.
  question: string
  // One or two English sentences saying what the customer wants.
  gloss: string
  language: string
  // Item names and field names the model was unsure of.
  unsure: string[]
  // The street as heard, checked against well-known streets in code.
  street: StreetCheck | null
}

export type StreetCheck = {
  heard: string
  // A well-known street it is close to, for the vendor to confirm.
  suggestion: string | null
}

const SUFFIX =
  /\b(street|st|road|rd|avenue|ave|way|close|crescent|drive|lane|expressway)\b\.?/gi
const core = (s: string) =>
  s
    .toLowerCase()
    .replace(SUFFIX, '')
    .replace(/[^a-z]/g, '')
// How a name sounds, roughly: consonants only, with the sounds Nigerian
// English and speech-to-text swap most (b/p, d/t/th, c/k/g) merged.
const sound = (s: string) =>
  core(s)
    .replace(/th/g, 't')
    .replace(/ph/g, 'f')
    .replace(/b/g, 'p')
    .replace(/d/g, 't')
    .replace(/[cqg]/g, 'k')
    .replace(/z/g, 's')
    .replace(/[aeiouyhw]/g, '')
    .replace(/(.)\1+/g, '$1')

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]!
}

const likeness = (a: string, b: string) =>
  1 - distance(a, b) / Math.max(a.length, b.length, 1)

// The street part of an address: no house number, nothing after a comma.
export const streetOf = (address: string) =>
  address
    .split(',')[0]!
    .replace(/^\s*(no\.?\s*)?\d+[a-z]?\s*,?\s*/i, '')
    .trim()

// Near-certain spellings are corrected; close ones are offered for the
// vendor to confirm; anything else is a street the desk cannot vouch for.
const SURE = 0.9
const CLOSE = 0.75

export function checkStreet(
  address: string,
  streets: string[],
): { address: string; street: StreetCheck | null } {
  if (streets.length === 0) return { address, street: null }
  const heard = streetOf(address)
  // Only what reads as a street is checked: a bare area or landmark is not.
  const looksLikeStreet =
    /\b(street|st|road|rd|avenue|ave|way|close|crescent|drive|lane|expressway)\b/i.test(
      heard,
    ) || /^\s*(no\.?\s*)?\d/i.test(address)
  if (!core(heard) || !looksLikeStreet) return { address, street: null }
  const best = streets
    .map((known) => ({
      known,
      score: Math.max(
        likeness(core(heard), core(known)),
        likeness(sound(heard), sound(known)),
      ),
    }))
    .sort((a, b) => b.score - a.score)[0]
  if (best && best.score >= SURE) {
    return { address: address.replace(heard, best.known), street: null }
  }
  return {
    address,
    street: {
      heard,
      suggestion: best && best.score >= CLOSE ? best.known : null,
    },
  }
}

export function voicePrompt(vocabulary: {
  glossary: Record<string, string>
  areas: string[]
  streets: string[]
  products: string[]
}): string {
  const glossary = Object.entries(vocabulary.glossary)
    .map(([k, v]) => `${k} = ${v}`)
    .join('; ')
  const m = market()
  return `This is a WhatsApp voice note from a customer of a small ${m.city} shop. They may speak ${m.speaks}, or a mix. Listen and fill in the order, in English. Do not write out what was said word for word.
items: each different thing they want, once. For each: name; quantity, only if they said a number for that item, otherwise empty; heard, their own words for that item in English, kept close to what they said, such as "two black caps, the plain one"; and unsure "yes" if you could not make out the item or how many. Words that describe or narrow something they already named, such as "the plain one", "the big size" or "that red one", belong to that same item: put them in its name, never list them as another item, and never copy a quantity onto them. List two items only when they clearly want two different things.
customerName: the name they give for themselves, if they say it
address: the street address with any house number, such as "14 Adeniran Ogunsanya Street"; if you are not sure of a word, write your best hearing and list "address" under unsure
landmark, area: a landmark near the address, and the area or neighbourhood
deliveryChoice: how they want to receive it, in their words, such as pick up, delivery or a park
state: the state or city if they are outside ${m.city}${m.outOfTown.shortForms ? `, including short forms such as ${m.outOfTown.shortForms}` : ''}
park: the motor park they named
payOnDelivery: yes if they will pay the rider on delivery, otherwise empty
question: anything they asked the shop, in English, or empty
gloss: one or two plain English sentences about the customer in the third person, starting with "They", saying what they want, such as "They want two head wraps delivered to Yaba."
language: the main language they spoke
unsure: which of items, quantity, address, area, state or landmark you could not make out clearly
Leave a field empty when they did not mention it.

${glossary ? `Pidgin words: ${glossary}\n` : ''}${m.city} areas: ${vocabulary.areas.join(', ')}${vocabulary.streets.length ? `\n${m.city} streets: ${vocabulary.streets.join(', ')}` : ''}
${vocabulary.products.length ? `The shop sells: ${vocabulary.products.join(', ')}` : ''}`.trim()
}

const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''

const yes = (v: unknown) => /^(yes|true)$/i.test(text(v))

// The model's JSON is untrusted input: keep only the expected shape. A
// street the desk does not know is marked unclear, so the draft confirms it
// before anything is sent to the wrong door.
export function pickVoice(
  json: unknown,
  streets: string[] = LAGOS_STREETS,
): VoiceNote {
  const o = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  const rawItems = Array.isArray(o.items) ? (o.items as unknown[]) : []
  const read = rawItems.map((i) => {
    const r = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>
    return {
      name: text(r.name),
      quantity: text(r.quantity),
      heard: text(r.heard),
      unsure: yes(r.unsure),
    }
  })
  const { items, merged } = checkItems(read.filter((i) => i.name))
  const unsure = new Set(
    (Array.isArray(o.unsure) ? o.unsure : [])
      .map(text)
      .filter((u) => UNSURE_NAMES.includes(u)),
  )
  for (const i of items) if (i.unsure && i.name) unsure.add(i.name)
  const checked = checkStreet(text(o.address), streets)
  if (checked.street) unsure.add('address')
  return {
    order: {
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: '',
      })),
      // Prices are the shop's to say, never heard from a voice note.
      total: '',
      customerName: text(o.customerName),
      address: checked.address,
      landmark: text(o.landmark),
      area: text(o.area),
      deliveryChoice: text(o.deliveryChoice),
      state: text(o.state),
      park: text(o.park),
      payOnDelivery: yes(o.payOnDelivery) ? 'yes' : '',
    },
    question: text(o.question),
    // The model's summary repeats the items it listed; once two were found
    // to be one, it is rebuilt from the checked items instead.
    gloss: merged
      ? itemsGloss(items, text(o.area) || text(o.state))
      : text(o.gloss),
    language: text(o.language),
    unsure: [...unsure],
    street: checked.street,
  }
}

type HeardItem = {
  name: string
  quantity: string
  heard: string
  unsure: boolean
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  pair: 2,
  couple: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  fifteen: 15,
  twenty: 20,
}

// The numbers in a phrase, as digits or English words.
export function numbersIn(phrase: string): number[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .flatMap((w) =>
      /^\d+$/.test(w)
        ? [Number(w)]
        : NUMBER_WORDS[w] !== undefined
          ? [NUMBER_WORDS[w]!]
          : [],
    )
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// The model's item list is checked against the customer's own words for
// each item, so a describing phrase never becomes a second item and a
// quantity is never copied onto words that did not say it:
// - an item whose words lie inside another's came from the same request,
//   so it is folded into that item, which is marked unsure;
// - a quantity that its own words do not say is marked unsure.
// Unsure items make the draft ask, so a guess never becomes a promise.
export function checkItems(read: HeardItem[]): {
  items: HeardItem[]
  merged: boolean
} {
  const kept: HeardItem[] = []
  let merged = false
  for (const item of read) {
    const h = words(item.heard)
    const host = h
      ? kept.find((k) => {
          const kh = words(k.heard)
          return kh && (kh.includes(h) || h.includes(kh))
        })
      : undefined
    if (host) {
      host.unsure = true
      merged = true
      continue
    }
    kept.push({ ...item })
  }
  for (const item of kept) {
    if (!item.heard || !item.quantity) continue
    const said = numbersIn(item.heard)
    const qty = numbersIn(item.quantity)[0]
    if (qty === undefined) continue
    if (said.length > 0 ? !said.includes(qty) : qty > 1) item.unsure = true
  }
  return { items: kept, merged }
}

const itemsGloss = (items: HeardItem[], place: string) =>
  items.length === 0
    ? ''
    : `They want ${items.map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join(' and ')}${place ? `, for ${place}` : ''}.`

// One specific question for the draft, about only what was unclear, so a
// guess never becomes a promise and the customer is not asked to repeat
// the whole note.
export function clarifyLine(note: VoiceNote): string | null {
  if (note.unsure.length === 0) return null
  const items = note.order.items.map((i) => i.name)
  const asks = note.unsure.flatMap((u) => {
    if (items.includes(u))
      return [`how many ${u} they want, or which one they mean`]
    if (u === 'quantity' || u === 'items')
      return [`how many of each item they want`]
    if (u === 'address') {
      const st = note.street
      return [
        st
          ? `the street name (it sounded like "${st.heard}"${st.suggestion ? `; it may be ${st.suggestion}` : ''})`
          : 'their full delivery address',
      ]
    }
    return ['where exactly to deliver']
  })
  const unique = [...new Set(asks)]
  const uncertain = note.unsure.filter((u) => items.includes(u))
  return `Part of the customer's voice note was unclear. Ask them kindly, in one short question, to confirm ${unique.join(' and ')}.${uncertain.length ? ` Do not state a number for ${uncertain.join(' or ')}.` : ''} Do not ask them to repeat the voice note.`
}

// The voice note as the on-device draft sees it: what it said, in English.
export function voiceLine(note: VoiceNote): string {
  return `[voice note, summed up by the desk: ${note.gloss}${note.question ? ` They asked: ${note.question}` : ''}]`
}
