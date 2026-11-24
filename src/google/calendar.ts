import type { Order } from '../ledger/types'

// Events the desk adds to the vendor's own Google Calendar. They hold order
// numbers, items and the area, never a phone number or a street address;
// customer names only when the vendor ticks for them.

export type CalendarEvent = {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
}

// "2026-11-21T15:00" style wall-clock time, read in the shop's time zone.
const wall = (ms: number) => new Date(ms).toISOString().slice(0, 16) + ':00'

export function deliveryRunEvent(p: {
  area: string
  orders: Order[]
  // Wall-clock milliseconds (UTC fields hold the shop's local time).
  startMs: number
  minutes: number
  timeZone: string
  name?: (customerId: string | null) => string
}): CalendarEvent {
  const lines = p.orders.map(
    (o) =>
      `#${o.code}${p.name ? ` ${p.name(o.customerId)}` : ''}: ${o.items.map((i) => `${i.qty} x ${i.name}`).join(', ') || 'items not captured'}`,
  )
  return {
    summary: `Deliveries: ${p.area} (${p.orders.length})`,
    description: [
      ...lines,
      '',
      "Added by Foil. Addresses and phone numbers stay in Foil, on the vendor's computer.",
    ].join('\n'),
    start: { dateTime: wall(p.startMs), timeZone: p.timeZone },
    end: {
      dateTime: wall(p.startMs + p.minutes * 60_000),
      timeZone: p.timeZone,
    },
  }
}

// The next full hour after now, as the default start of a run.
export function nextHour(nowMs: number): number {
  const h = 3_600_000
  return Math.floor(nowMs / h) * h + h
}

// "15:30" on the day of `dayMs`, as wall-clock milliseconds; null if the
// text is not a time.
export function atTime(dayMs: number, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const day = Math.floor(dayMs / 86_400_000) * 86_400_000
  return day + (h * 60 + min) * 60_000
}
