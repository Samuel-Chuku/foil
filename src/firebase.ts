import { initializeApp } from 'firebase/app'
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check'
import { getAI, GoogleAIBackend } from 'firebase/ai'
import { bridgeToken } from './bridge/client'

declare global {
  // Read by the App Check SDK. Must be set before initializeAppCheck.
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined
}

const env = import.meta.env

// Extension pages cannot load the remote reCAPTCHA script, so the extension
// attests with an App Check debug token, which the hackathon rules accept.
const inExtension = globalThis.location?.protocol === 'chrome-extension:'

export const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

// A built extension asks the hosted bridge page for real App Check tokens
// (see src/bridge). Without a bridge address, as in local development, it
// falls back to a registered debug token.
const bridgeUrl = env.VITE_APPCHECK_BRIDGE_URL
const useBridge = inExtension && Boolean(bridgeUrl)

if (env.DEV || (inExtension && !useBridge)) {
  // An unset token makes the SDK print a fresh one to register in the console.
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
    env.VITE_APPCHECK_DEBUG_TOKEN || true
}

initializeAppCheck(firebaseApp, {
  provider: useBridge
    ? new CustomProvider({ getToken: () => bridgeToken(bridgeUrl!) })
    : inExtension
      ? new CustomProvider({
          // Never called: debug mode supplies the token.
          getToken: () =>
            Promise.reject(new Error('App Check debug token is not set')),
        })
      : new ReCaptchaEnterpriseProvider(
          env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '',
        ),
  isTokenAutoRefreshEnabled: true,
})

export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })
