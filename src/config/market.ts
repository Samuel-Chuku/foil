// The market a shop sells in: its currency, its instant-payment rail, its
// clock and the language replies are written in. Everything else in the
// desk (matching, orders, books, privacy, hybrid routing) is the same in
// every market. Lagos is the first market, built and measured end to end.

export type MarketId = 'ng' | 'in' | 'br'

// The instant-payment network whose reference the receipt carries.
export type RailId = 'nip' | 'upi' | 'pix'

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
  reply: { language: string; onDevice: boolean }
  // International dialling code, for normalising phone numbers.
  phonePrefix: string
}

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
    reply: { language: 'English or Nigerian Pidgin', onDevice: true },
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
    reply: { language: 'English', onDevice: true },
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
    reply: { language: 'Brazilian Portuguese', onDevice: false },
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
