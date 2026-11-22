import type { Credit } from '../verify/types'
import { flowRows, type FlowRow } from './flow'
import { shiftDay } from './trends'
import type { Order, Settlement } from './types'

// The live view of money confirmed by the vendor's bank alerts: today so far
// against the same point last week, a run of days, and the latest alerts.
// Reversals are shown in the feed but never counted as money in or out.

const DAY_MS = 86_400_000

export type Side = {
  kobo: number
  // The same day last week, up to the same time of day.
  lastWeekKobo: number
  // A fraction (0.25 is 25% more); null when last week had nothing to compare.
  change: number | null
}

export type PulseDay = { day: string; inKobo: number; outKobo: number }

export type Pulse = {
  today: { in: Side; out: Side }
  days: PulseDay[]
  latest: FlowRow[]
  // When the newest dated alert arrived, in Lagos wall-clock milliseconds.
  newestMs: number | null
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const counted = (c: Credit) => !c.reversal && c.at !== null

function side(kobo: number, lastWeekKobo: number): Side {
  return {
    kobo,
    lastWeekKobo,
    change: lastWeekKobo > 0 ? (kobo - lastWeekKobo) / lastWeekKobo : null,
  }
}

// `now` is Lagos wall-clock milliseconds, like every credit's time.
export function moneyPulse(
  credits: Credit[],
  orders: Order[],
  settlements: Settlement[],
  now: number,
  span: number,
  feedSize = 8,
): Pulse {
  const today = dayOf(now)
  const weekAgo = now - 7 * DAY_MS
  const lastWeekDay = dayOf(weekAgo)
  const sum = (dir: Credit['direction'], keep: (c: Credit) => boolean) =>
    credits
      .filter((c) => counted(c) && c.direction === dir && keep(c))
      .reduce((t, c) => t + c.amountKobo, 0)
  const isToday = (c: Credit) => dayOf(c.at!.ms) === today && c.at!.ms <= now
  const isLastWeek = (c: Credit) =>
    dayOf(c.at!.ms) === lastWeekDay && c.at!.ms <= weekAgo

  const days: PulseDay[] = []
  for (let i = span - 1; i >= 0; i--) {
    const day = shiftDay(today, -i)
    const on = (c: Credit) => dayOf(c.at!.ms) === day && c.at!.ms <= now
    days.push({ day, inKobo: sum('credit', on), outKobo: sum('debit', on) })
  }

  const dated = flowRows(credits, orders, settlements).filter(
    (r) => r.credit.at !== null && r.credit.at.ms <= now,
  )
  return {
    today: {
      in: side(sum('credit', isToday), sum('credit', isLastWeek)),
      out: side(sum('debit', isToday), sum('debit', isLastWeek)),
    },
    days,
    latest: dated.slice(0, feedSize),
    newestMs: dated[0]?.credit.at?.ms ?? null,
  }
}
