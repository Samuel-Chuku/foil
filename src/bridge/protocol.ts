// The messages between the extension's side panel and the App Check bridge
// page on the hosted site.

// The extensions allowed to ask the bridge for tokens. A build from this
// repository has a fixed ID, set by the public key in its manifest; the
// Chrome Web Store gives its copy an ID of its own, listed here too. Keep
// this list and the frame-ancestors header in firebase.json the same.
export const EXTENSION_ORIGINS = [
  'chrome-extension://kglhadfgnelipmfglhndakoipifpbnba',
]

export type TokenRequest = {
  type: 'appcheck-token-request'
  id: number
  forceRefresh?: boolean
}

export type TokenReply = {
  type: 'appcheck-token'
  id: number
  token: string | null
}

// App Check tokens are JWTs; the custom provider needs their expiry.
export function tokenExpiry(token: string): number {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}
