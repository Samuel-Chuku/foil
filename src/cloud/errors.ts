// Plain words for what goes wrong with a model, on the device or in the
// cloud. The vendor never sees a raw SDK message, which can hold a URL, a
// status code and JSON. Pure, so every case is tested.

export const ERRORS = {
  offline: 'You are offline. Nothing was sent.',
  quota:
    'The free cloud allowance is used up for now. Try again in a minute. Checks that run on this computer, such as matching payments to bank alerts, still work.',
  refused: 'The cloud refused this app. Reload the panel and try again.',
  tooLarge: 'That file is too large to send. Try a shorter one.',
  blocked: 'The model declined to answer this one.',
  busy: 'The cloud service is busy right now. Try again in a minute.',
  unreachable:
    'The cloud could not be reached. Check your connection and try again.',
  unreadable: 'The answer came back in a form Foil could not read. Try again.',
  deviceTooLong:
    'This is too long for the model on this computer. Try a smaller picture or fewer messages.',
  deviceNotReady:
    'The model on this computer is not ready. Wait for it to finish loading, then try again.',
  stopped: 'Stopped before an answer came back. Try again.',
  other: 'Something went wrong. Try again.',
} as const

type Shape = {
  name: string
  message: string
  code: string
  status: number | null
}

function shape(e: unknown): Shape {
  if (!e || typeof e !== 'object') {
    return { name: '', message: String(e), code: '', status: null }
  }
  const o = e as Record<string, unknown>
  const data = o.customErrorData as Record<string, unknown> | undefined
  return {
    name: typeof o.name === 'string' ? o.name : '',
    message: typeof o.message === 'string' ? o.message : '',
    code: typeof o.code === 'string' ? o.code : '',
    status: typeof data?.status === 'number' ? data.status : null,
  }
}

export function errorMessage(e: unknown, online: boolean): string {
  const { name, message, code, status } = shape(e)
  const has = (re: RegExp) => re.test(message)

  // The desk's own errors are plain Errors written for the vendor already;
  // the SDK, the browser and the on-device model all throw subclasses.
  if (e instanceof Error && e.constructor === Error && message) return message
  if (name === 'SyntaxError') return ERRORS.unreadable
  // The on-device model's own refusals come as DOMExceptions.
  if (
    name === 'QuotaExceededError' ||
    has(/too (large|long)|too many tokens/i)
  ) {
    return code === 'fetch-error' || status === 413
      ? ERRORS.tooLarge
      : ERRORS.deviceTooLong
  }
  if (name === 'AbortError') return ERRORS.stopped
  if (name === 'NotSupportedError' || name === 'InvalidStateError') {
    return ERRORS.deviceNotReady
  }

  const network =
    code === 'fetch-error' ||
    name === 'TypeError' ||
    has(/failed to fetch|networkerror|network request failed/i)
  if (status === 429 || has(/\b429\b|quota|resource.?exhausted/i)) {
    return ERRORS.quota
  }
  if (status === 403 || has(/\b403\b|app.?check|permission/i))
    return ERRORS.refused
  if (status === 413) return ERRORS.tooLarge
  if (has(/safety|blocked|prohibited|recitation/i)) return ERRORS.blocked
  if (
    (status !== null && status >= 500) ||
    has(/\b50[0-4]\b|overloaded|unavailable/i)
  ) {
    return ERRORS.busy
  }
  if (network) return online ? ERRORS.unreachable : ERRORS.offline

  return ERRORS.other
}
