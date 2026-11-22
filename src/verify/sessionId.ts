import { market, MARKETS, type RailId } from '../config/market'
import type { LagosMs } from './types'

// A transfer's reference on its payment rail: a NIP session ID in Nigeria, a
// UPI reference in India, a Pix end-to-end ID in Brazil. Each rail is read by
// its own rules; matching treats them alike.
export type SessionId = {
  // The reference, normalised (digits for NIP and UPI, the ID for Pix).
  digits: string
  // The sending institution's code on the rail (the NIP institution code, or
  // the Pix ISPB), or empty when the reference carries none (UPI).
  nipCode: string
  // The local time written inside the reference, before any bank offset, or
  // null when the reference carries no time (UPI).
  stampedMs: LagosMs | null
}

// What the reference is called, for the reasons the vendor reads.
export const REF_LABEL: Record<RailId, string> = {
  nip: 'session ID',
  upi: 'UPI reference',
  pix: 'Pix ID',
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

// The rail defaults to the shop's market, so every reader of a receipt,
// alert or bank-app row uses the same rules.
export function decodeSessionId(
  text: string,
  rail: RailId = market().rail,
): SessionIdResult {
  if (rail === 'upi') return decodeUpi(text)
  if (rail === 'pix') return decodePix(text)
  return decodeNip(text)
}

// UPI references are 12 digits, which NPCI's circulars confirm. Their inner
// layout is described only by secondary sources, so no date is read from
// them: a UPI reference is checked by its form and by reuse alone.
function decodeUpi(text: string): SessionIdResult {
  const runs = digitRuns(text)
  const digits = runs.find((r) => r.length === 12)
  if (digits)
    return { ok: true, value: { digits, nipCode: '', stampedMs: null } }
  return runs.some((r) => r.length >= 10 && r.length <= 14)
    ? { ok: false, reason: 'length' }
    : { ok: false, reason: 'missing' }
}

// A Pix end-to-end ID: "E", the sending institution's 8-character ISPB, the
// UTC date and time as yyyyMMddHHmm, then 11 letters or digits (32 in all).
// Banco Central's Pix manual uses this layout (prefix, ISPB, date, 11-character
// sequence) for its identifiers, and Pix providers document the UTC timestamp.
const PIX = /\bE([0-9A-Z]{8})(\d{12})([A-Za-z0-9]{11})\b/
function decodePix(text: string): SessionIdResult {
  // Read as written first; only an ID broken by spaces is read with them
  // removed, so it is never glued onto the field beside it.
  const m = PIX.exec(text) ?? PIX.exec(text.replace(/\s+/g, ''))
  if (!m) {
    return /\bE[0-9A-Za-z]{24,40}\b/.test(text.replace(/\s+/g, ''))
      ? { ok: false, reason: 'length' }
      : { ok: false, reason: 'missing' }
  }
  const t = m[2]!
  const [y, mo, d, h, mi] = [
    Number(t.slice(0, 4)),
    Number(t.slice(4, 6)),
    Number(t.slice(6, 8)),
    Number(t.slice(8, 10)),
    Number(t.slice(10, 12)),
  ] as [number, number, number, number, number]
  const utc = Date.UTC(y, mo - 1, d, h, mi)
  const back = new Date(utc)
  if (
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    h > 23 ||
    mi > 59
  ) {
    return { ok: false, reason: 'date' }
  }
  return {
    ok: true,
    value: {
      digits: m[0],
      nipCode: m[1]!,
      stampedMs: utc + MARKETS.br.utcOffsetMin * 60_000,
    },
  }
}

// Reference-like runs that may be one character off a real reference, for
// recovering a misread one against the alerts.
export function nearRuns(text: string, rail: RailId = market().rail): string[] {
  if (rail === 'upi')
    return digitRuns(text).filter((r) => r.length >= 11 && r.length <= 13)
  if (rail === 'pix') {
    return text.replace(/\s+/g, '').match(/E[0-9A-Za-z]{30,32}/g) ?? []
  }
  return digitRuns(text).filter((r) => r.length >= 29 && r.length <= 31)
}

function decodeNip(text: string): SessionIdResult {
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
