import { tokenFromRedirect, type Token } from '../inbox/gmail'

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export const gmailClientId = () => import.meta.env.VITE_GMAIL_WEB_CLIENT_ID

export class SignInNeeded extends Error {}

// Signs in to one Google account through Chrome's web auth window, which can
// reach any account, not only the one Chrome itself is signed in to. The
// token lives in memory for about an hour and is renewed silently while
// Google's session for that account lasts.
export async function gmailToken(opts: {
  // The account to renew; omitted when connecting a new one.
  email?: string
  interactive: boolean
}): Promise<Token> {
  const clientId = gmailClientId()
  if (!clientId) throw new Error('The Gmail client ID is not set.')
  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: chrome.identity.getRedirectURL(),
    response_type: 'token',
    scope: SCOPE,
    state,
    prompt: opts.interactive ? 'select_account' : 'none',
  })
  if (opts.email) params.set('login_hint', opts.email)
  let redirect: string | undefined
  try {
    redirect = await chrome.identity.launchWebAuthFlow({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      interactive: opts.interactive,
      // Google may redirect by script, so the silent flow waits for it.
      abortOnLoadForNonInteractive: false,
      timeoutMsForNonInteractive: 10_000,
    })
  } catch (e) {
    if (!opts.interactive) throw new SignInNeeded(String(e))
    throw e
  }
  if (!redirect) throw new SignInNeeded('No answer from Google.')
  const t = tokenFromRedirect(redirect, state, Date.now())
  if ('error' in t) {
    if (t.error === 'access_denied') {
      throw new Error('Access to Gmail was not allowed.')
    }
    throw new SignInNeeded(t.error)
  }
  return t
}
