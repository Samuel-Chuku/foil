import { describe, expect, it } from 'vitest'
import { tokenExpiry } from './protocol'

describe('tokenExpiry', () => {
  it('reads the expiry of an App Check JWT, in milliseconds', () => {
    const payload = btoa(JSON.stringify({ exp: 1_800_000_000 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(tokenExpiry(`header.${payload}.signature`)).toBe(1_800_000_000_000)
  })

  it('gives zero for anything it cannot read', () => {
    expect(tokenExpiry('not-a-token')).toBe(0)
  })
})
