import type { Part } from 'firebase/ai'

// Nothing private reaches the cloud without the vendor seeing it first. A
// cloud request is built once, shown to the vendor exactly as it will be
// sent, and only the approved object can be sent.

export type Attachment = {
  kind: 'audio' | 'image'
  mimeType: string
  base64: string
  // What the vendor sees in place of the bytes.
  label: string
}

export type CloudRequest = {
  // Shown as the dialog's heading, e.g. "Read a voice note".
  feature: string
  // Why this job needs the cloud, in a sentence.
  reason: string
  // The text parts, verbatim as sent.
  texts: string[]
  attachment?: Attachment
  // Where it goes, when not to Google's Gemini service: the vendor's own
  // Google Sheet or Calendar.
  to?: 'Google Sheets' | 'Google Calendar'
  // Everything a tool lookup could add later in this chat, in full. Not sent
  // now; the model's lookups send parts of it, and nothing outside it.
  mayReturn?: string
  // What was swapped out before sending, e.g. "the customer's name".
  replaced: string[]
}

declare const approvedMark: unique symbol
export type Approved = CloudRequest & { readonly [approvedMark]: true }

// Called only on the vendor's click on a preview of exactly what is sent:
// the approval dialog, or a books-chat question they typed and can see.
export function approve(request: CloudRequest): Approved {
  return Object.freeze({ ...request }) as Approved
}

// What the vendor approved is exactly what is sent: the parts are built from
// the approved request and nothing else.
export function partsOf(request: Approved): (string | Part)[] {
  return [
    ...request.texts,
    ...(request.attachment
      ? [
          {
            type: 'inlineData' as const,
            inlineData: {
              mimeType: request.attachment.mimeType,
              data: request.attachment.base64,
            },
          },
        ]
      : []),
  ]
}

// Byte size of base64 data, for the preview.
export function base64Bytes(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - pad)
}

export function sizeText(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Order matters: longer digit runs first, so a session ID is not taken for
// a phone number.
const PATTERNS: { re: RegExp; label: string; what: string }[] = [
  {
    re: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
    label: '(email)',
    what: 'email addresses',
  },
  { re: /\b\d{20,32}\b/g, label: '(reference)', what: 'transfer references' },
  {
    re: /(\+?234[\s-]?|\b0)[789][01]\d([\s-]?\d){7}\b/g,
    label: '(phone number)',
    what: 'phone numbers',
  },
  { re: /\b\d{10}\b/g, label: '(account number)', what: 'account numbers' },
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Replaces the given names (whole words, any case) and every phone number,
// account number, reference and email with a neutral label. Returns the
// text and what kinds of thing were replaced.
export function redact(
  text: string,
  names: { name: string; label: string }[] = [],
): { text: string; replaced: string[] } {
  const replaced = new Set<string>()
  let out = text
  for (const p of PATTERNS) {
    const next = out.replace(p.re, p.label)
    if (next !== out) replaced.add(p.what)
    out = next
  }
  // Longest first, so "Femi Adeyemi" goes before "Femi".
  const parts = names
    .flatMap(({ name, label }) => {
      const full = name.trim()
      const words = full.split(/\s+/).filter((w) => w.length > 2)
      return [full, ...words].map((n) => ({ n, label }))
    })
    .filter(({ n }) => n.length > 2)
    .sort((a, b) => b.n.length - a.n.length)
  for (const { n, label } of parts) {
    const re = new RegExp(`(?<![\\p{L}\\d])${escape(n)}(?![\\p{L}\\d])`, 'giu')
    const next = out.replace(re, label)
    if (next !== out) replaced.add('names')
    out = next
  }
  return { text: out, replaced: [...replaced] }
}
