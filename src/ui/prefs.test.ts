import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFS,
  parsePrefs,
  replyManner,
  resolvedTheme,
  withWindows,
} from './prefs'

describe('parsePrefs', () => {
  it('falls back to the defaults for nothing stored', () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('junk')).toEqual(DEFAULT_PREFS)
  })

  it('keeps good fields and replaces bad ones one by one', () => {
    const p = parsePrefs({ theme: 'dark', accent: 'neon', pidgin: 'yes' })
    expect(p.theme).toBe('dark')
    expect(p.accent).toBe(DEFAULT_PREFS.accent)
    expect(p.pidgin).toBe(DEFAULT_PREFS.pidgin)
  })

  it('pulls slider values into range and onto the step', () => {
    expect(parsePrefs({ textScale: 300 }).textScale).toBe(125)
    expect(parsePrefs({ textScale: 103 }).textScale).toBe(105)
    expect(parsePrefs({ sameBankWindowMin: 0 }).sameBankWindowMin).toBe(2)
  })

  it('keeps an unset matching window as "recommended"', () => {
    expect(parsePrefs({ interbankWindowMin: null }).interbankWindowMin).toBe(
      null,
    )
  })
})

describe('withWindows', () => {
  const base = { sameBankWindowMin: 10, interbankWindowMin: 60, rail: 'nip' }

  it('follows the recommended windows until the vendor moves a slider', () => {
    expect(withWindows(base, DEFAULT_PREFS)).toEqual(base)
    expect(
      withWindows(base, { sameBankWindowMin: 5, interbankWindowMin: null }),
    ).toEqual({ ...base, sameBankWindowMin: 5 })
  })
})

describe('resolvedTheme', () => {
  it('follows the browser only on System', () => {
    expect(resolvedTheme('system', true)).toBe('dark')
    expect(resolvedTheme('system', false)).toBe('light')
    expect(resolvedTheme('light', true)).toBe('light')
  })
})

describe('replyManner', () => {
  it('turns the reply settings into instructions', () => {
    expect(
      replyManner({ replyTone: 'formal', replyLength: 'fuller' }),
    ).toMatchObject({
      tone: expect.stringContaining('formal'),
      length: expect.stringContaining('five sentences'),
    })
  })
})
