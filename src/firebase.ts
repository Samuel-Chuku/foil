import { initializeApp } from 'firebase/app'
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check'
import { getAI, GoogleAIBackend } from 'firebase/ai'

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

if (env.DEV || inExtension) {
  // An unset token makes the SDK print a fresh one to register in the console.
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
    env.VITE_APPCHECK_DEBUG_TOKEN || true
}

initializeAppCheck(firebaseApp, {
  provider: inExtension
    ? new CustomProvider({
        // Never called: debug mode supplies the token in the extension.
        getToken: () =>
          Promise.reject(new Error('App Check debug token is not set')),
      })
    : new ReCaptchaEnterpriseProvider(
        env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '',
      ),
  isTokenAutoRefreshEnabled: true,
})

export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })
