import type { LagosMs } from './types'

export type SessionId = {
  digits: string
  nipCode: string
  // The YYMMDDHHmmss reading, before any bank timezone offset.
  stampedMs: LagosMs
}

export type SessionIdResult =
  | { ok: true; value: SessionId }
  // 'other-route': an ID in a non-NIP layout, such as Moniepoint's "APT..."
  // on transfers into OPay, which proves nothing either way.
  | { ok: false; reason: 'missing' | 'length' | 'date' | 'other-route' }

// Digit runs that could be a NIP session ID. Receipts sometimes prefix the ID
// with letters ("NXG...") or space it out, so unbroken runs are tried first and
// spaced-out ones second, without gluing two separate IDs together.
export function digitRuns(text: string): string[] {
  const plain = text.match(/\d+/g) ?? []
  const spaced =
    text.match(/\d[\d -]*\d/g)?.map((r) => r.replace(/[ -]/g, '')) ?? []
  return [...plain, ...spaced]
}

export function decodeSessionId(text: string): SessionIdResult {
  const runs = digitRuns(text).filter((r) => r.length >= 25)
  if (runs.length === 0) return { ok: false, reason: 'missing' }
  const digits = runs.find((r) => r.length === 30)
  if (!digits) {
    return /APT\d{20,}/i.test(text)
      ? { ok: false, reason: 'other-route' }
      : { ok: false, reason: 'length' }
  }
  const n = (from: number) => Number(digits.slice(from, from + 2))
  const [y, mo, d, h, mi, s] = [6, 8, 10, 12, 14, 16].map(n) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const ms = Date.UTC(2000 + y, mo - 1, d, h, mi, s)
  const back = new Date(ms)
  if (
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59
  ) {
    return { ok: false, reason: 'date' }
  }
  return {
    ok: true,
    value: { digits, nipCode: digits.slice(0, 6), stampedMs: ms },
  }
}

// One digit is sometimes miscopied when a long ID is read from an image, so a
// single substitution, insertion or deletion still counts as the same ID.
export function sameSessionId(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

// A truncated ID shown in a bank app agrees with a longer one when it is the
// start of it, allowing the same one-digit slip as whole IDs. The slip may add
// or drop a digit, so the start is compared at three lengths.
export function prefixOf(prefix: string, full: string): boolean {
  if (full.startsWith(prefix)) return true
  const n = prefix.length
  return [n - 1, n, n + 1].some(
    (k) => k > 0 && k <= full.length && sameSessionId(prefix, full.slice(0, k)),
  )
}
