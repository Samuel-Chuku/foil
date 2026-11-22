import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import { sampleHistory } from '../sample/history'
import { CHART_IDS, chartSpec, sumOf } from './charts'
import { dueKobo } from './ledger'
import { pickAnswer, pickReport } from './report'
import { shiftDay, trends, trendsText } from './trends'
import type { Order } from './types'

// The synthetic history on a plain clock: order times are Lagos wall-clock.
const DAY_MS = Date.UTC(2026, 10, 21)
const data = sampleHistory(DAY_MS, 14, (ms) => ms)
const lagos = {
  day: (o: Order) => new Date(o.createdAt).toISOString().slice(0, 10),
  hour: (o: Order) => new Date(o.createdAt).getUTCHours(),
}
const bankName = (id: string | null) => id ?? 'unknown'
const week = trends('2026-11-20', 7, data, config, lagos)

describe('sampleHistory', () => {
  it('is the same on every visit', () => {
    const again = sampleHistory(DAY_MS, 14, (ms) => ms)
    expect(again.orders.map((o) => o.amountKobo)).toEqual(
      data.orders.map((o) => o.amountKobo),
    )
  })

  it('names no customer and no sender', () => {
    expect(data.orders.every((o) => o.customerId === null)).toBe(true)
    expect(data.credits.every((c) => c.sender === '')).toBe(true)
  })

  it('pays every paid order in full, delivery fee included', () => {
    for (const o of data.orders.filter((x) => x.payment.state === 'matched')) {
      const c = data.credits.find((x) => x.id === o.payment.creditId)
      expect(c?.amountKobo).toBe(dueKobo(o))
    }
  })
})

describe('trends', () => {
  it('has one point per day, oldest first, ending on the day asked', () => {
    expect(week.days).toHaveLength(7)
    expect(week.days[0]!.day).toBe('2026-11-14')
    expect(week.days[6]!.day).toBe('2026-11-20')
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
  })

  it('sums the period and the one before it', () => {
    expect(week.current.orders).toBe(
      week.days.reduce((s, d) => s + d.orders, 0),
    )
    // The sample's second week is busier, so there is a rise to explain.
    expect(week.current.orders).toBeGreaterThan(week.previous.orders)
  })

  it('counts orders by hour and payment waits by bucket', () => {
    expect(week.hours.reduce((s, n) => s + n, 0)).toBe(week.current.orders)
    const paid = data.orders.filter(
      (o) => o.payment.state === 'matched' && lagos.day(o) >= '2026-11-14',
    ).length
    expect(week.payTimes.reduce((s, p) => s + p.count, 0)).toBe(paid)
    expect(week.medianPayMin).not.toBeNull()
  })

  it('totals money in by bank, biggest first', () => {
    expect(week.banks.reduce((s, b) => s + b.inKobo, 0)).toBe(week.moneyInKobo)
    const amounts = week.banks.map((b) => b.inKobo)
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
  })

  it('gives the cloud numbers and never a name', () => {
    const text = trendsText(week, bankName)
    expect(text).toContain('Trends for 2026-11-14 to 2026-11-20 (7 days')
    expect(text).toMatch(/Orders: \d+ \(up \d+% on the 7 days before\)/)
  })
})

describe('chartSpec', () => {
  it('draws every chart from the trends alone', () => {
    for (const id of CHART_IDS) {
      const spec = chartSpec(week, id, bankName)
      expect(spec.points.length).toBeGreaterThan(0)
      expect(spec.summary).not.toBe('')
    }
  })

  it('stacks paid and open sales per day', () => {
    const spec = chartSpec(week, 'sales-by-day', bankName)
    expect(spec.series).toEqual(['Paid', 'Still open'])
    expect(spec.points.map(sumOf)).toEqual(
      week.days.map((d) => d.paidKobo + d.openKobo),
    )
  })
})

describe('pickReport and pickAnswer', () => {
  it('keeps known chart ids and drops anything else', () => {
    const r = pickReport({
      headline: ' Busier week ',
      findings: [
        { text: 'Saturday was biggest', chart: 'sales-by-day' },
        { text: 'Evenings are busy', chart: 'pie-of-doom' },
        { text: '', chart: 'top-items' },
      ],
      suggestions: ['Restock headwraps', 7],
    })
    expect(r).toEqual({
      headline: 'Busier week',
      findings: [
        { text: 'Saturday was biggest', chart: 'sales-by-day' },
        { text: 'Evenings are busy', chart: null },
      ],
      suggestions: ['Restock headwraps'],
    })
    expect(pickAnswer({ answer: '₦41,000', chart: 'none' })).toEqual({
      text: '₦41,000',
      chart: null,
    })
    expect(pickReport(null).findings).toEqual([])
  })
})
