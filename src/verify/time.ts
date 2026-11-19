import type { Stamp } from './types'

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

function validDate(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

function findDate(s: string): [number, number, number] | null {
  let m = /\b(20\d\d)-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return [+m[1]!, +m[2]!, +m[3]!]
  // Nigerian receipts write numeric dates day first.
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)\b/.exec(s)
  if (m) return [+m[3]!, +m[2]!, +m[1]!]
  m =
    /\b([a-z]{3})[a-z]*\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(20\d\d)\b/.exec(
      s,
    )
  if (m && MONTHS.includes(m[1]!))
    return [+m[3]!, MONTHS.indexOf(m[1]!) + 1, +m[2]!]
  m =
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3})[a-z]*\.?,?[\s-]+(20\d\d)\b/.exec(
      s,
    )
  if (m && MONTHS.includes(m[2]!))
    return [+m[3]!, MONTHS.indexOf(m[2]!) + 1, +m[1]!]
  return null
}

// Reads the date and time as written on a receipt or alert, in Lagos time.
// A missing time gives day precision rather than a guessed midnight.
export function parseLagosStamp(text: string): Stamp | null {
  // Some bank emails arrive with junk markup inside the time ("10<:15:...>50").
  const s = text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/(\d)t(\d)/, '$1 $2')
  const date = findDate(s)
  if (!date) return null
  const [y, mo, d] = date
  if (!validDate(y, mo, d)) return null
  const t = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(
    s.replace(/\b20\d\d-\d{1,2}-\d{1,2}/, ''),
  )
  if (!t) return { ms: Date.UTC(y, mo - 1, d), precision: 'day' }
  let h = +t[1]!
  const min = +t[2]!
  const sec = t[3] ? +t[3] : 0
  if (t[4] === 'pm' && h < 12) h += 12
  if (t[4] === 'am' && h === 12) h = 0
  if (h > 23 || min > 59 || sec > 59) return null
  return {
    ms: Date.UTC(y, mo - 1, d, h, min, sec),
    precision: t[3] ? 'second' : 'minute',
  }
}

// Gmail and other clocks give true time; Lagos is a fixed hour ahead of UTC.
export function lagosFromEpoch(epochMs: number): number {
  return epochMs + 3_600_000
}
