import { formatNaira } from '../verify/money'
import type { Trends } from './trends'

// The charts the desk can draw. The cloud may pick one by its id to back a
// finding or an answer, but every number in a chart comes from the device.
export const CHART_IDS = [
  'sales-by-day',
  'orders-by-day',
  'orders-by-hour',
  'time-to-pay',
  'money-by-bank',
  'top-items',
] as const
export type ChartId = (typeof CHART_IDS)[number]

export const CHART_TITLES: Record<ChartId, string> = {
  'sales-by-day': 'Sales by day, paid and still open',
  'orders-by-day': 'Orders by day',
  'orders-by-hour': 'When orders come in',
  'time-to-pay': 'Time from order to confirmed payment',
  'money-by-bank': 'Money in by bank',
  'top-items': 'Top items on paid orders',
}

export type ChartPoint = {
  label: string
  // Stacked from the baseline in this order; one value for a single series.
  values: number[]
}

export type ChartSpec = {
  id: ChartId
  title: string
  // Columns run along time; bars list categories down the page.
  kind: 'columns' | 'bars'
  unit: 'naira' | 'count'
  series: string[]
  points: ChartPoint[]
  // One sentence that says what the chart shows, for screen readers.
  summary: string
}

export const isChartId = (v: unknown): v is ChartId =>
  typeof v === 'string' && (CHART_IDS as readonly string[]).includes(v)

export const chartValue = (unit: ChartSpec['unit'], v: number) =>
  unit === 'naira' ? formatNaira(v) : String(v)

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

const peak = (points: ChartPoint[]) =>
  points.reduce<ChartPoint | null>(
    (best, p) => (!best || sumOf(p) > sumOf(best) ? p : best),
    null,
  )
export const sumOf = (p: ChartPoint) => p.values.reduce((s, v) => s + v, 0)

export function chartSpec(
  t: Trends,
  id: ChartId,
  bankName: (id: string | null) => string,
): ChartSpec {
  const title = CHART_TITLES[id]
  switch (id) {
    case 'sales-by-day': {
      const points = t.days.map((d) => ({
        label: shortDay(d.day),
        values: [d.paidKobo, d.openKobo],
      }))
      const top = peak(points)
      return {
        id,
        title,
        kind: 'columns',
        unit: 'naira',
        series: ['Paid', 'Still open'],
        points,
        summary: `Paid ${formatNaira(t.current.paidKobo)} over ${t.days.length} days${top && sumOf(top) ? `; the biggest day was ${top.label}` : ''}.`,
      }
    }
    case 'orders-by-day': {
      const points = t.days.map((d) => ({
        label: shortDay(d.day),
        values: [d.orders],
      }))
      return {
        id,
        title,
        kind: 'columns',
        unit: 'count',
        series: ['Orders'],
        points,
        summary: `${t.current.orders} orders over ${t.days.length} days, against ${t.previous.orders} the ${t.days.length} days before.`,
      }
    }
    case 'orders-by-hour': {
      // Shop hours only, so the chart is not mostly empty night.
      const used = t.hours.flatMap((c, h) => (c ? [h] : []))
      const from = Math.min(8, ...used)
      const to = Math.max(21, ...used)
      const points = t.hours
        .map((c, h) => ({ label: `${h}`, values: [c], h }))
        .filter((p) => p.h >= from && p.h <= to)
        .map(({ label, values }) => ({ label, values }))
      const top = peak(points)
      return {
        id,
        title,
        kind: 'columns',
        unit: 'count',
        series: ['Orders'],
        points,
        summary:
          top && sumOf(top)
            ? `Orders by hour of the day; the busiest hour starts at ${top.label}:00.`
            : 'No orders yet in this period.',
      }
    }
    case 'time-to-pay':
      return {
        id,
        title,
        kind: 'bars',
        unit: 'count',
        series: ['Paid orders'],
        points: t.payTimes.map((p) => ({ label: p.label, values: [p.count] })),
        summary:
          t.medianPayMin === null
            ? 'No paid orders yet in this period.'
            : `Half of paid orders were confirmed within ${t.medianPayMin} minutes of ordering.`,
      }
    case 'money-by-bank':
      return {
        id,
        title,
        kind: 'bars',
        unit: 'naira',
        series: ['Money in'],
        points: t.banks.map((b) => ({
          label: bankName(b.bank),
          values: [b.inKobo],
        })),
        summary: `${formatNaira(t.moneyInKobo)} in across ${t.banks.length} bank${t.banks.length === 1 ? '' : 's'}.`,
      }
    case 'top-items':
      return {
        id,
        title,
        kind: 'bars',
        unit: 'count',
        series: ['Sold'],
        points: t.items.map((i) => ({ label: i.name, values: [i.qty] })),
        summary: t.items[0]
          ? `${t.items[0].name} sold most, ${t.items[0].qty} in this period.`
          : 'Nothing sold on paid orders yet in this period.',
      }
  }
}

// Told to the cloud so it knows what each chart id shows.
export const chartMenu = () =>
  `Charts the shop can show, by id: ${CHART_IDS.map((id) => `"${id}" (${CHART_TITLES[id].toLowerCase()})`).join(', ')}.`
