// The market a shop sells in: its currency, its instant-payment rail, its
// clock, and how its shops and customers talk. Everything else in the desk
// (matching, orders, books, privacy, hybrid routing) is the same in every
// market, so a new market is a new entry here rather than a branch in the
// code that uses it. Lagos is the first market, built and measured end to
// end.

export type MarketId = 'ng' | 'in' | 'br'

// The instant-payment network whose reference the receipt carries.
export type RailId = 'nip' | 'upi' | 'pix'

// A language the shop writes or is answered in. Chrome's built-in model
// writes English and English-based Pidgin; the rest are written in the
// cloud, after the vendor approves.
export type MarketLanguage = {
  id: string
  label: string
  // How prompts name it.
  prompt: string
  onDevice: boolean
}

export type Market = {
  id: MarketId
  city: string
  country: string
  currency: {
    code: string
    symbol: string
    locale: string
    // Words and signs that mark an amount in this currency, lowercase.
    marks: string[]
    // Brazil writes R$ 1.234,56: a comma before the cents.
    decimalComma: boolean
    // A space between the symbol and the number (R$ 1.850).
    spaced: boolean
  }
  rail: RailId
  // What receipts call the transfer's reference, for prompts and reasons.
  refLabel: string
  // Minutes ahead of UTC. None of these markets has daylight saving.
  utcOffsetMin: number
  // The IANA zone, for events in the vendor's calendar.
  timeZone: string
  // The language replies are drafted in, and whether Chrome's built-in
  // model supports it (its documented languages are en, ja, es, de, fr).
  // `style` tells drafts how a shop here writes; `pidgin` lets a draft answer
  // Pidgin with Pidgin, which the vendor can turn off in Settings.
  reply: { language: string; onDevice: boolean; style: string; pidgin: boolean }
  // What the vendor's typed reply can be rewritten into, besides its tone.
  rewriteInto: MarketLanguage[]
  // What Ask Foil can answer in, best first, with the voice that reads it.
  answerIn: (MarketLanguage & { voiceLang: string })[]
  // The language prompts say answers come back in.
  promptLanguage: string
  // What customers may speak in their voice notes.
  speaks: string
  // How orders for outside the city are read: how prompts name the place,
  // short forms customers use for it, and whether goods go by motor park.
  outOfTown: { state: string; shortForms: string | null; motorParks: boolean }
  // Voice notes bring the city's Pidgin glossary, well-known areas and
  // streets; elsewhere they use the shop's own delivery areas.
  localVoice: boolean
  // International dialling code, for normalising phone numbers.
  phonePrefix: string
}

const lang = (
  id: string,
  label: string,
  prompt: string,
  onDevice: boolean,
): MarketLanguage => ({ id, label, prompt, onDevice })

const answer = (
  id: string,
  label: string,
  prompt: string,
  onDevice: boolean,
  voiceLang: string,
) => ({ id, label, prompt, onDevice, voiceLang })

export const MARKETS: Record<MarketId, Market> = {
  ng: {
    id: 'ng',
    city: 'Lagos',
    country: 'Nigeria',
    currency: {
      code: 'NGN',
      symbol: '₦',
      locale: 'en-NG',
      marks: ['ngn', 'naira', '₦', '#'],
      decimalComma: false,
      spaced: false,
    },
    rail: 'nip',
    refLabel: 'session ID',
    utcOffsetMin: 60,
    timeZone: 'Africa/Lagos',
    reply: {
      language: 'English or Nigerian Pidgin',
      onDevice: true,
      style: 'Reply in the same language the customer uses.',
      pidgin: true,
    },
    rewriteInto: [
      lang('pidgin', 'In Pidgin', 'natural Lagos Nigerian Pidgin', true),
      lang('english', 'In English', 'plain Nigerian English', true),
      lang('yoruba', 'In Yoruba', 'Yoruba, with correct tone marks', false),
      lang('igbo', 'In Igbo', 'Igbo', false),
      lang('hausa', 'In Hausa', 'Hausa', false),
    ],
    answerIn: [
      answer('english', 'English', 'English', true, 'en-NG'),
      answer(
        'pidgin',
        'Pidgin',
        'natural Lagos Nigerian Pidgin',
        true,
        'en-NG',
      ),
      answer(
        'yoruba',
        'Yoruba',
        'Yoruba, with correct tone marks',
        false,
        'yo-NG',
      ),
      answer('igbo', 'Igbo', 'Igbo', false, 'ig-NG'),
      answer('hausa', 'Hausa', 'Hausa', false, 'ha-NG'),
    ],
    promptLanguage: 'English',
    speaks: 'English, Nigerian Pidgin, Yoruba, Igbo or Hausa',
    outOfTown: {
      state: 'the Nigerian state or city for delivery, as written',
      shortForms: 'PH or Abj',
      motorParks: true,
    },
    localVoice: true,
    phonePrefix: '234',
  },
  in: {
    id: 'in',
    city: 'Mumbai',
    country: 'India',
    currency: {
      code: 'INR',
      symbol: '₹',
      locale: 'en-IN',
      marks: ['inr', 'rs.', 'rs', 'rupees', '₹'],
      decimalComma: false,
      spaced: false,
    },
    rail: 'upi',
    refLabel: 'UPI reference',
    utcOffsetMin: 330,
    timeZone: 'Asia/Kolkata',
    reply: {
      language: 'English',
      onDevice: true,
      style:
        'Reply in friendly, plain English, the way a Mumbai shop writes to customers on WhatsApp. If the customer writes "ji" or a common Hindi word, you may answer as politely, but write in English.',
      pidgin: false,
    },
    rewriteInto: [
      lang('english', 'In English', 'plain English', true),
      lang('hindi', 'In Hindi', 'Hindi, in Devanagari script', false),
    ],
    answerIn: [
      answer('english', 'English', 'English', true, 'en-IN'),
      answer('hindi', 'Hindi', 'Hindi, in Devanagari script', false, 'hi-IN'),
    ],
    promptLanguage: 'English',
    speaks: 'English, Hindi or Marathi',
    outOfTown: {
      state: 'another city or state for delivery, if outside Mumbai',
      shortForms: null,
      motorParks: false,
    },
    localVoice: false,
    phonePrefix: '91',
  },
  br: {
    id: 'br',
    city: 'São Paulo',
    country: 'Brazil',
    currency: {
      code: 'BRL',
      symbol: 'R$',
      locale: 'pt-BR',
      marks: ['brl', 'r$', 'reais', 'real'],
      decimalComma: true,
      spaced: true,
    },
    rail: 'pix',
    refLabel: 'Pix transaction ID',
    utcOffsetMin: -180,
    timeZone: 'America/Sao_Paulo',
    reply: {
      language: 'Brazilian Portuguese',
      onDevice: false,
      style:
        'Reply in natural Brazilian Portuguese, short and friendly, the way a São Paulo shop writes to customers on WhatsApp. Write amounts like R$ 150,00.',
      pidgin: false,
    },
    rewriteInto: [
      lang('portuguese', 'In Portuguese', 'Brazilian Portuguese', false),
      lang('english', 'In English', 'plain English', true),
    ],
    answerIn: [
      answer(
        'portuguese',
        'Portuguese',
        'Brazilian Portuguese',
        false,
        'pt-BR',
      ),
      answer('english', 'English', 'English', true, 'en-US'),
    ],
    promptLanguage: 'Brazilian Portuguese',
    speaks: 'Brazilian Portuguese',
    outOfTown: {
      state: 'another city or state for delivery, if outside São Paulo',
      shortForms: null,
      motorParks: false,
    },
    localVoice: false,
    phonePrefix: '55',
  },
}

export const isMarketId = (v: unknown): v is MarketId =>
  v === 'ng' || v === 'in' || v === 'br'

// The market this session runs in. Set before the first render, from the
// demo's chosen city or the shop's setting; Lagos when nothing says.
let active: Market = MARKETS.ng

export function market(): Market {
  return active
}

export function setMarket(id: MarketId): void {
  active = MARKETS[id]
}
