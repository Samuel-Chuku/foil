import type { MessageLabel } from '../ledger/types'

// The waiting-queue sort, as settled in the feasibility spike: up to 16
// customers' latest messages per request, numbered 1 to N, never their ids,
// with the answer constrained to one letter per number.

export const BATCH = 16
// Keeps each request far under the on-device limit of 9,216 tokens.
const PER_MESSAGE_CHARS = 280

export const LETTER: Record<string, MessageLabel> = {
  O: 'order',
  P: 'payment',
  Q: 'question',
  C: 'complaint',
  X: 'other',
}

export function triagePrompt(texts: string[]): string {
  const lines = texts.map(
    (t, n) =>
      `${n + 1}. ${t.replace(/\s+/g, ' ').trim().slice(0, PER_MESSAGE_CHARS)}`,
  )
  return `These are the latest messages from customers of a small Nigerian shop on WhatsApp, in English or Nigerian Pidgin. Give each number one letter:
O = wants to buy or is placing an order
P = about paying or a payment they made (sent money, receipt, account details)
Q = a question (price, availability, delivery, hours)
C = a complaint or something has gone wrong (late, wrong item, damaged, unhappy)
X = anything else (greetings, thanks)
Answer only like 1:O,2:Q

${lines.join('\n')}`
}

// "1:O,2:Q" for N messages, exactly.
export function triagePattern(n: number): RegExp {
  const parts = Array.from({ length: n }, (_, i) => `${i + 1}:[OPQCX]`)
  return new RegExp(`^${parts.join(',')}$`)
}

// Reads the one-letter answer, or the cloud's JSON form ({"1":"O",...} or
// ["O","Q"]). Returns null when any number is missing, so nothing is
// labelled on a half answer.
export function parseTriage(text: string, n: number): MessageLabel[] | null {
  const t = text.trim()
  let letters: string[] = []
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const json = JSON.parse(t) as unknown
      letters = Array.isArray(json)
        ? json.map(String)
        : Array.from({ length: n }, (_, i) =>
            String((json as Record<string, unknown>)[String(i + 1)] ?? ''),
          )
    } catch {
      return null
    }
  } else {
    const found = new Map<number, string>()
    for (const m of t.matchAll(/(\d+)\s*:\s*([OPQCX])/gi)) {
      found.set(Number(m[1]), m[2]!.toUpperCase())
    }
    letters = Array.from({ length: n }, (_, i) => found.get(i + 1) ?? '')
  }
  const labels = letters.slice(0, n).map((l) => LETTER[l.trim().toUpperCase()])
  return labels.length === n && labels.every(Boolean)
    ? (labels as MessageLabel[])
    : null
}
