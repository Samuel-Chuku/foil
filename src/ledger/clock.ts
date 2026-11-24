import { market } from '../config/market'
import { shopTime } from '../verify/time'
import type { Order } from './types'

const DAY_MS = 86_400_000

// The shop's clock, in wall-clock milliseconds whose UTC fields read as the
// shop's local time. Records hold real moments; the extension's clock is the
// real one, while the demo runs on its own sample day, so real moments are
// shifted by the difference before they are shown or grouped by day.
export type ShopClock = {
  now(): number
  // The real moment now, which drop holds run on in every host.
  real(): number
  // Today in the shop, as YYYY-MM-DD.
  today(): string
  // Midnight starting the shop's today.
  dayStart(): number
  // The shop's day and hour an order came in.
  day(o: Order): string
  hour(o: Order): number
  // HH:MM of a real moment.
  time(epochMs: number): string
  // A wall-clock time on this clock, back to the real moment.
  toEpoch(wallMs: number): number
}

export function shopClock(hostNow: () => number): ShopClock {
  const shift = () => hostNow() - shopTime(Date.now())
  const wall = (epochMs: number) => new Date(shopTime(epochMs) + shift())
  return {
    now: hostNow,
    real: () => Date.now(),
    today: () => new Date(hostNow()).toISOString().slice(0, 10),
    dayStart: () => {
      const now = hostNow()
      return now - (now % DAY_MS)
    },
    day: (o) => wall(o.createdAt).toISOString().slice(0, 10),
    hour: (o) => wall(o.createdAt).getUTCHours(),
    time: (epochMs) => wall(epochMs).toISOString().slice(11, 16),
    toEpoch: (wallMs) => wallMs - market().utcOffsetMin * 60_000 - shift(),
  }
}
