import { describe, expect, it } from 'vitest'
import { modelLoad, oneAtATime } from './run'

const later = <T>(value: T, ms: number) =>
  new Promise<T>((r) => setTimeout(() => r(value), ms))

describe('oneAtATime', () => {
  it('runs requests in order, never two at once', async () => {
    const log: string[] = []
    let active = 0
    const job = (name: string, ms: number) =>
      oneAtATime(async () => {
        active += 1
        expect(active).toBe(1)
        log.push(`start ${name}`)
        await later(null, ms)
        log.push(`end ${name}`)
        active -= 1
        return name
      })
    const results = await Promise.all([job('a', 20), job('b', 5), job('c', 1)])
    expect(results).toEqual(['a', 'b', 'c'])
    expect(log).toEqual([
      'start a',
      'end a',
      'start b',
      'end b',
      'start c',
      'end c',
    ])
  })

  it('keeps going after a failed request and counts what waits', async () => {
    const seen: number[] = []
    const stop = modelLoad.subscribe(() => seen.push(modelLoad.get().waiting))
    const failed = oneAtATime(() => Promise.reject(new Error('no')))
    const next = oneAtATime(() => later('ok', 1))
    await expect(failed).rejects.toThrow('no')
    await expect(next).resolves.toBe('ok')
    stop()
    expect(Math.max(...seen)).toBe(2)
    expect(modelLoad.get()).toEqual({ running: false, waiting: 0 })
  })
})
