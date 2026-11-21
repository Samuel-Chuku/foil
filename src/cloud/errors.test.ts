import { describe, expect, it } from 'vitest'
import { ERRORS, errorMessage } from './errors'

// Shaped like the SDK's AIError: a subclass with a code and response status.
class FakeAIError extends Error {
  code: string
  customErrorData?: { status?: number }
  constructor(
    code: string,
    message: string,
    customErrorData?: { status?: number },
  ) {
    super(message)
    this.code = code
    this.customErrorData = customErrorData
  }
}

const fetchError = (status: number, text = '') =>
  new FakeAIError(
    'fetch-error',
    `AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/...: [${status} ] ${text}`,
    { status },
  )

describe('errorMessage', () => {
  it('turns cloud status codes into plain sentences', () => {
    expect(
      errorMessage(fetchError(429, 'You exceeded your current quota'), true),
    ).toBe(ERRORS.quota)
    expect(errorMessage(fetchError(403), true)).toBe(ERRORS.refused)
    expect(errorMessage(fetchError(413), true)).toBe(ERRORS.tooLarge)
    expect(errorMessage(fetchError(503, 'The model is overloaded'), true)).toBe(
      ERRORS.busy,
    )
    expect(errorMessage(fetchError(500), true)).toBe(ERRORS.busy)
  })

  it('never shows the raw SDK message', () => {
    const odd = new FakeAIError('error', 'AI: something internal {"a":1}')
    expect(errorMessage(odd, true)).toBe(ERRORS.other)
  })

  it('says when a response was blocked', () => {
    const e = new FakeAIError(
      'response-error',
      'Response was blocked due to SAFETY',
    )
    expect(errorMessage(e, true)).toBe(ERRORS.blocked)
  })

  it('tells offline from unreachable', () => {
    const e = new TypeError('Failed to fetch')
    expect(errorMessage(e, false)).toBe(ERRORS.offline)
    expect(errorMessage(e, true)).toBe(ERRORS.unreachable)
  })

  it('reads the on-device model refusals', () => {
    expect(
      errorMessage(
        new DOMException('The input is too large.', 'QuotaExceededError'),
        true,
      ),
    ).toBe(ERRORS.deviceTooLong)
    expect(errorMessage(new DOMException('', 'NotSupportedError'), true)).toBe(
      ERRORS.deviceNotReady,
    )
    expect(errorMessage(new DOMException('', 'AbortError'), true)).toBe(
      ERRORS.stopped,
    )
  })

  it('reports an unreadable answer', () => {
    expect(errorMessage(new SyntaxError('Unexpected token'), true)).toBe(
      ERRORS.unreadable,
    )
  })

  it("keeps the desk's own messages, which are written for the vendor", () => {
    const own = new Error('Open the chat in WhatsApp Web first.')
    expect(errorMessage(own, true)).toBe('Open the chat in WhatsApp Web first.')
    expect(errorMessage('weird', true)).toBe(ERRORS.other)
  })
})
