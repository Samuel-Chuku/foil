import type { GmailMessage } from './gmail'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export class GmailAuthError extends Error {}

async function call<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new GmailAuthError('Signed out of Gmail.')
  if (!res.ok) throw new Error(`Gmail answered ${res.status}.`)
  return (await res.json()) as T
}

export async function profileEmail(token: string): Promise<string> {
  const p = await call<{ emailAddress: string }>(token, '/profile')
  return p.emailAddress
}

// Ids of the messages the query matches; Google runs the search.
export async function listMessageIds(
  token: string,
  q: string,
  max = 50,
): Promise<string[]> {
  const r = await call<{ messages?: { id: string }[] }>(
    token,
    `/messages?${new URLSearchParams({ q, maxResults: String(max) })}`,
  )
  return (r.messages ?? []).map((m) => m.id)
}

export function getMessage(token: string, id: string): Promise<GmailMessage> {
  return call<GmailMessage>(token, `/messages/${id}?format=full`)
}
