import {
  isMarketId,
  setMarket,
  type MarketId,
  type RailId,
} from '../config/market'

const KEY = 'market'

export const RAIL_NAME: Record<RailId, string> = {
  nip: 'bank transfers',
  upi: 'UPI',
  pix: 'Pix',
}

// The shop's market (the demo's city, or the extension's setting), kept in
// this browser. Lagos
// when nothing is stored or storage is blocked.
export function startMarket(): void {
  try {
    const stored = localStorage.getItem(KEY)
    if (isMarketId(stored)) setMarket(stored)
  } catch {
    // Private windows may refuse storage; the demo opens in Lagos.
  }
}

export function rememberMarket(id: MarketId): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Without storage the switch lasts only until the reload.
  }
  setMarket(id)
}
