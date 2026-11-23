import { GOOGLE_SCOPES } from '../google/api'
import type { Token } from '../inbox/gmail'
import { googleToken } from './gmailAuth'

// One Google sign-in for Sheets and Calendar, kept in memory only and
// renewed silently while Google's session lasts. Closing the panel forgets
// it; nothing about the account is stored.
let token: Token | null = null

export async function sheetsCalendarToken(interactive: boolean) {
  if (token && token.expiresAt > Date.now()) return token.accessToken
  token = await googleToken(GOOGLE_SCOPES, 'Google Sheets and Calendar', {
    interactive,
  })
  return token.accessToken
}

export function forgetGoogle() {
  token = null
}
