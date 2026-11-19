import { describe, expect, it } from 'vitest'
import { parseNairaKobo } from './money'
import { nameScore } from './names'
import { decodeSessionId, sameSessionId } from './sessionId'
import { parseLagosStamp } from './time'

describe('parseNairaKobo', () => {
  it.each([
    ['NGN 30,000.00', 3_000_000],
    ['₦5,000.00', 500_000],
    ['#4,500', 450_000],
    ['- ₦ 25.00', 2_500],
    ['+₦12,500.5', 1_250_050],
    ['NGN 141515', 14_151_500],
    ['N7,000', 700_000],
    ['22k', 2_200_000],
    ['5000 naira', 500_000],
  ])('%s', (text, kobo) => expect(parseNairaKobo(text)).toBe(kobo))

  it('rejects text with no amount', () => {
    expect(parseNairaKobo('pending')).toBeNull()
    expect(parseNairaKobo('')).toBeNull()
  })
})

describe('nameScore', () => {
  it('ignores word order and commas', () => {
    expect(nameScore('Okafor, Adaeze', 'ADAEZE OKAFOR')).toBe(1)
  })
  it('accepts truncated and split names from bank narrations', () => {
    expect(nameScore('Adaeze Chioma Okafor', 'ADAEZE CHIO MA OKA')).toBe(1)
  })
  it('finds names glued to narration text', () => {
    expect(nameScore('Tunde Bakare', 'NIP TRF TUNDEBAKAREFOOD')).toBe(1)
  })
  it('scores a different person low', () => {
    expect(nameScore('Tunde Bakare', 'IFEOMA NWOSU')).toBe(0)
  })
  it('ignores titles', () => {
    expect(nameScore('Mrs Bisi Adeyemi', 'BISI ADEYEMI')).toBe(1)
  })
})

describe('decodeSessionId', () => {
  const id = '000013261118171101000042020001'
  it('decodes bank code and stamped time', () => {
    const r = decodeSessionId(id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.nipCode).toBe('000013')
    expect(new Date(r.value.stampedMs).toISOString()).toBe(
      '2026-11-18T17:11:01.000Z',
    )
  })
  it('finds the ID inside a prefixed reference', () => {
    expect(decodeSessionId(`NXG${id}`).ok).toBe(true)
  })
  it('reports a dropped digit as a length problem', () => {
    expect(decodeSessionId(id.slice(1))).toEqual({
      ok: false,
      reason: 'length',
    })
  })
  it('reports an impossible date', () => {
    expect(decodeSessionId('000013261341171101000042020001')).toEqual({
      ok: false,
      reason: 'date',
    })
  })
  it('reports a missing ID', () => {
    expect(decodeSessionId('TRF/2026/88')).toEqual({
      ok: false,
      reason: 'missing',
    })
  })
  it('treats one miscopied digit as the same ID', () => {
    expect(sameSessionId(id, id.replace(/1$/, '7'))).toBe(true)
    expect(sameSessionId(id, id.slice(0, 20) + id.slice(21))).toBe(true)
    expect(sameSessionId(id, id.replace(/01$/, '77'))).toBe(false)
  })
})

describe('parseLagosStamp', () => {
  const iso = (text: string) => {
    const s = parseLagosStamp(text)
    return s && [new Date(s.ms).toISOString().slice(0, 19), s.precision]
  }
  it.each([
    ['Fri, Nov 13, 2026 at 6:34 PM', '2026-11-13T18:34:00', 'minute'],
    ['Nov 13th, 2026 18:34:52', '2026-11-13T18:34:52', 'second'],
    ['13/11/2026 06:34 PM', '2026-11-13T18:34:00', 'minute'],
    ['2026-11-13T18:34', '2026-11-13T18:34:00', 'minute'],
    ['13 Nov 2026, 12:05 AM', '2026-11-13T00:05:00', 'minute'],
    ['26-Oct-2026', '2026-10-26T00:00:00', 'day'],
  ])('%s', (text, at, precision) => expect(iso(text)).toEqual([at, precision]))

  it('rejects impossible dates', () => {
    expect(parseLagosStamp('31/02/2026 10:00')).toBeNull()
  })
})
