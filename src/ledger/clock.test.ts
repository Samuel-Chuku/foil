import { afterEach, describe, expect, it, vi } from 'vitest'
import { setMarket } from '../config/market'
import { shopClock } from './clock'
import type { Order } from './types'

// Synthetic moments only.
const at = (createdAt: number) => ({ createdAt }) as Order
const REAL = Date.UTC(2026, 10, 24, 22, 30) // 22:30 UTC, 24 Nov

afterEach(() => {
  vi.useRealTimers()
  setMarket('ng')
})

describe('shopClock', () => {
  it('reads real moments in the shop city, past midnight when it is', () => {
    vi.useFakeTimers({ now: REAL })
    setMarket('ng') // UTC+1
    const clock = shopClock(() => REAL + 60 * 60_000)
    expect(clock.today()).toBe('2026-11-24')
    expect(clock.day(at(REAL))).toBe('2026-11-24')
    expect(clock.hour(at(REAL))).toBe(23)
    expect(clock.time(REAL)).toBe('23:30')
    setMarket('in') // UTC+5:30, already the 25th
    const mumbai = shopClock(() => REAL + 330 * 60_000)
    expect(mumbai.day(at(REAL))).toBe('2026-11-25')
    expect(mumbai.time(REAL)).toBe('04:00')
  })

  it('shifts real moments onto the demo sample day', () => {
    vi.useFakeTimers({ now: REAL })
    setMarket('br') // UTC-3
    const sample = Date.UTC(2026, 10, 21, 15, 0) // 15:00 on the sample day
    const clock = shopClock(() => sample)
    expect(clock.today()).toBe('2026-11-21')
    expect(clock.day(at(REAL))).toBe('2026-11-21')
    expect(clock.time(REAL)).toBe('15:00')
    expect(clock.time(REAL - 90 * 60_000)).toBe('13:30')
    expect(clock.dayStart()).toBe(Date.UTC(2026, 10, 21))
  })

  it('turns a time on its own clock back into the real moment', () => {
    vi.useFakeTimers({ now: REAL })
    setMarket('in')
    const sample = Date.UTC(2026, 10, 21, 15, 0)
    const clock = shopClock(() => sample)
    const wall = Date.UTC(2026, 10, 21, 12, 0)
    expect(clock.time(clock.toEpoch(wall))).toBe('12:00')
  })
})
