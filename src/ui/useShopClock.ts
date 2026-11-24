import { createContext, useContext } from 'react'
import type { ShopClock } from '../ledger/clock'

// The shop clock the panel runs on, for the cards inside it.
export const ShopClockContext = createContext<ShopClock | null>(null)

export function useShopClock(): ShopClock {
  const clock = useContext(ShopClockContext)
  if (!clock) throw new Error('A card used the shop clock outside the panel.')
  return clock
}
