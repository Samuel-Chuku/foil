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
  return `This is a WhatsApp voice note from a customer of a small Lagos shop. They may speak English, Nigerian Pidgin, Yoruba, Igbo or Hausa, or a mix. Listen and fill in the order, in English. Do not write out what was said word for word.
items: each item they want, with its quantity as said (a number or a word), and unsure "yes" if you could not make out the item or how many
customerName: the name they give for themselves, if they say it
address: the street address with any house number, such as "14 Adeniran Ogunsanya Street"; if you are not sure of a word, write your best hearing and list "address" under unsure
landmark, area: a landmark near the address, and the area or neighbourhood
deliveryChoice: how they want to receive it, in their words, such as pick up, delivery or a park
state: the Nigerian state or city if they are outside Lagos, including short forms such as PH or Abj
park: the motor park they named
payOnDelivery: yes if they will pay the rider on delivery, otherwise empty
question: anything they asked the shop, in English, or empty
gloss: one or two plain English sentences saying what they want
language: the main language they spoke
unsure: which of items, quantity, address, area, state or landmark you could not make out clearly
Leave a field empty when they did not mention it.

Pidgin words: ${glossary}
Lagos areas: ${vocabulary.areas.join(', ')}
Lagos streets: ${vocabulary.streets.join(', ')}
${vocabulary.products.length ? `The shop sells: ${vocabulary.products.join(', ')}` : ''}`.trim()
}

const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''

const yes = (v: unknown) => /^(yes|true)$/i.test(text(v))

// The model's JSON is untrusted input: keep only the expected shape.
export function pickVoice(json: unknown): VoiceNote {
  const o = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  const rawItems = Array.isArray(o.items) ? (o.items as unknown[]) : []
  const items = rawItems.map((i) => {
    const r = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>
    return {
      name: text(r.name),
      quantity: text(r.quantity),
      unsure: yes(r.unsure),
    }
  })
  const unsure = new Set(
    (Array.isArray(o.unsure) ? o.unsure : [])
      .map(text)
      .filter((u) => UNSURE_NAMES.includes(u)),
  )
  for (const i of items) if (i.unsure && i.name) unsure.add(i.name)
  return {
    order: {
      items: items
        .filter((i) => i.name)
        .map((i) => ({ name: i.name, quantity: i.quantity, price: '' })),
      // Prices are the shop's to say, never heard from a voice note.
      total: '',
      customerName: text(o.customerName),
      address: text(o.address),
      landmark: text(o.landmark),
      area: text(o.area),
      deliveryChoice: text(o.deliveryChoice),
      state: text(o.state),
      park: text(o.park),
      payOnDelivery: yes(o.payOnDelivery) ? 'yes' : '',
    },
    question: text(o.question),
    gloss: text(o.gloss),
    language: text(o.language),
    unsure: [...unsure],
  }
}

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
    if (u === 'address') return ['their full delivery address']
    return ['where exactly to deliver']
  })
  const unique = [...new Set(asks)]
  const uncertain = note.unsure.filter((u) => items.includes(u))
  return `Part of the customer's voice note was unclear. Ask them kindly, in one short question, to confirm ${unique.join(' and ')}.${uncertain.length ? ` Do not state a number for ${uncertain.join(' or ')}.` : ''} Do not ask them to repeat the voice note.`
}

// The voice note as the on-device draft sees it: what it said, in English.
export function voiceLine(note: VoiceNote): string {
  return `[voice note: ${note.gloss}${note.question ? ` They asked: ${note.question}` : ''}]`
}
