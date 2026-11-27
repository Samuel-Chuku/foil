import { initializeApp } from 'firebase/app'
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check'
import {
  EXTENSION_ORIGINS,
  type TokenReply,
  type TokenRequest,
} from './protocol'

// A tiny page on the hosted site that the extension frames. reCAPTCHA
// Enterprise cannot run inside an extension page, so it runs here, on a
// domain the reCAPTCHA key allows, and hands the App Check token to the
// extension. It answers only the extension itself; the hosting headers also
// stop any other site from framing it (see firebase.json).

const env = import.meta.env
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(
    env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '',
  ),
  isTokenAutoRefreshEnabled: true,
})

window.addEventListener('message', (event: MessageEvent<TokenRequest>) => {
  if (!EXTENSION_ORIGINS.includes(event.origin)) return
  if (event.data?.type !== 'appcheck-token-request') return
  const reply = (r: TokenReply) =>
    (event.source as Window | null)?.postMessage(r, event.origin)
  getToken(appCheck, Boolean(event.data.forceRefresh)).then(
    ({ token }) => reply({ type: 'appcheck-token', id: event.data.id, token }),
    () => reply({ type: 'appcheck-token', id: event.data.id, token: null }),
  )
})

// Tells the extension the bridge is ready to take requests.
// Each allowed origin is tried; the browser delivers only to the one that
// actually embeds this page.
for (const origin of EXTENSION_ORIGINS) {
  window.parent.postMessage({ type: 'appcheck-bridge-ready' }, origin)
}
