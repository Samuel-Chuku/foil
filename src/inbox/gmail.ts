import type { AlertEmail } from '../verify/alerts'
import { lagosFromEpoch } from '../verify/time'

// Pure helpers for the Gmail API: the search that runs on Google's side, and
// turning a message into the AlertEmail the rules already read. No network
// here, so it can be tested.

export type GmailPart = {
  mimeType?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}

export type GmailMessage = {
  id: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPart
}

const quote = (s: string) => `"${s.replace(/"/g, '')}"`

// Only mail the vendor marked as bank alerts, or from the known bank senders,
// is ever listed or downloaded; the rest of the inbox never leaves Google.
// `afterSec` keeps each check to recent mail.
export function alertQuery(
  scope: { label: string } | { senders: string[] },
  afterSec: number,
): string {
  const where =
    'label' in scope
      ? `label:${quote(scope.label)}`
      : `from:(${scope.senders.join(' OR ')})`
  return `${where} after:${Math.floor(afterSec)}`
}

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#8358': '₦',
}

// Bank alerts are HTML tables. Cells become tabs and rows become lines, so
// "Amount" and its value stay on one line, as the parsers expect.
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      // Line breaks in HTML source mean nothing; tags decide the lines.
      .replace(/\s+/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h\d|li|table)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&(#?\w+);/g, (m, e: string) => {
        if (ENTITIES[e]) return ENTITIES[e]
        const n = /^#(\d+)$/.exec(e)
        return n ? String.fromCharCode(Number(n[1])) : m
      })
      .split('\n')
      .map((l) => l.replace(/[ \t ]+$/g, '').replace(/^[  ]+/, ''))
      .filter((l) => l.trim())
      .join('\n')
      .trim()
  )
}

function findPart(part: GmailPart, type: string): GmailPart | null {
  if (part.mimeType === type && part.body?.data) return part
  for (const p of part.parts ?? []) {
    const found = findPart(p, type)
    if (found) return found
  }
  return null
}

// The plain-text part when the bank sends one, otherwise the HTML as text.
export function messageText(payload: GmailPart): string {
  const plain = findPart(payload, 'text/plain')
  if (plain?.body?.data) return decodeBase64Url(plain.body.data)
  const html = findPart(payload, 'text/html')
  return html?.body?.data ? htmlToText(decodeBase64Url(html.body.data)) : ''
}

const header = (p: GmailPart | undefined, name: string) =>
  p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
  ''

// "GTBank <gens@gtbank.com>" becomes "gens@gtbank.com".
export function senderAddress(from: string): string {
  const m = /<([^>]+)>/.exec(from)
  return (m ? m[1]! : from).trim().toLowerCase()
}

export function toAlertEmail(m: GmailMessage): AlertEmail {
  return {
    // The Gmail id is unique per message; the same alert seen in two
    // accounts is caught by its session ID instead (see freshCredits).
    id: `gmail-${m.id}`,
    from: senderAddress(header(m.payload, 'From')),
    body: m.payload ? messageText(m.payload) : '',
    receivedAt: lagosFromEpoch(Number(m.internalDate ?? 0)),
    inSpam: m.labelIds?.includes('SPAM') ?? false,
  }
}

export type Token = { accessToken: string; expiresAt: number }

// Reads the token Google puts in the redirect URL's fragment, checking the
// state sent with the request so a stray redirect is refused.
export function tokenFromRedirect(
  url: string,
  state: string,
  now: number,
): Token | { error: string } {
  const hash = url.split('#')[1] ?? ''
  const q = new URLSearchParams(hash)
  if (q.get('error')) return { error: q.get('error')! }
  if (q.get('state') !== state) return { error: 'state_mismatch' }
  const accessToken = q.get('access_token')
  if (!accessToken) return { error: 'no_token' }
  const expiresIn = Number(q.get('expires_in') ?? 3600)
  // A minute's margin so a check never starts on a token about to lapse.
  return { accessToken, expiresAt: now + (expiresIn - 60) * 1000 }
}
