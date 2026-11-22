import { tokenExpiry, type TokenReply, type TokenRequest } from './protocol'

// The extension's side of the App Check bridge: a hidden frame of the hosted
// bridge page, asked for a token by message whenever the SDK needs one.

const WAIT_MS = 15_000
let frame: Promise<{ window: Window; origin: string }> | null = null
let next = 0

function openFrame(url: string): Promise<{ window: Window; origin: string }> {
  frame ??= new Promise((resolve, reject) => {
    const origin = new URL(url).origin
    const iframe = document.createElement('iframe')
    iframe.src = url
    iframe.hidden = true
    iframe.title = 'App Check'
    const timer = setTimeout(() => {
      frame = null
      reject(new Error('The App Check bridge did not load.'))
    }, WAIT_MS)
    const ready = (event: MessageEvent) => {
      if (event.origin !== origin) return
      if ((event.data as { type?: string })?.type !== 'appcheck-bridge-ready') {
        return
      }
      clearTimeout(timer)
      window.removeEventListener('message', ready)
      resolve({ window: iframe.contentWindow!, origin })
    }
    window.addEventListener('message', ready)
    document.body.append(iframe)
  })
  return frame
}

export async function bridgeToken(
  url: string,
): Promise<{ token: string; expireTimeMillis: number }> {
  const { window: target, origin } = await openFrame(url)
  const id = ++next
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', reply)
      reject(new Error('The App Check bridge did not answer.'))
    }, WAIT_MS)
    function reply(event: MessageEvent<TokenReply>) {
      if (event.origin !== origin || event.data?.type !== 'appcheck-token') {
        return
      }
      if (event.data.id !== id) return
      clearTimeout(timer)
      window.removeEventListener('message', reply)
      const token = event.data.token
      if (!token) reject(new Error('The App Check bridge had no token.'))
      else resolve({ token, expireTimeMillis: tokenExpiry(token) })
    }
    window.addEventListener('message', reply)
    const request: TokenRequest = { type: 'appcheck-token-request', id }
    target.postMessage(request, origin)
  })
}
