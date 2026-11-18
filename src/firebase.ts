import { initializeApp } from 'firebase/app'
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check'
import { getAI, GoogleAIBackend } from 'firebase/ai'

declare global {
  // Read by the App Check SDK on localhost. Must be set before initializeAppCheck.
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined
}

const env = import.meta.env

export const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

if (env.DEV) {
  // An unset token makes the SDK print a fresh one to register in the console.
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
    env.VITE_APPCHECK_DEBUG_TOKEN || true
}

initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider(
    env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '',
  ),
  isTokenAutoRefreshEnabled: true,
})

export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })
