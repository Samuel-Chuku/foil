import { useId, useState } from 'react'
import { market } from '../config/market'
import { chartValue, sumOf, type ChartSpec } from '../ledger/charts'

const W = 320
const H = 150
const LEFT = 40
const BOTTOM = 18
const TOP = 6

// Short axis labels: ₦12k, ₦1.2m.
function compact(unit: ChartSpec['unit'], v: number): string {
  if (unit === 'count') return String(v)
  const naira = v / 100
  const sym = market().currency.symbol
  if (naira >= 1_000_000) return `${sym}${+(naira / 1_000_000).toFixed(1)}m`
  if (naira >= 1_000) return `${sym}${+(naira / 1_000).toFixed(1)}k`
  return `${sym}${naira}`
}

// A rounded, readable top for the axis: 1, 2 or 5 times a power of ten.
function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p
}

// A column rounded at its data end and square at the baseline.
function column(x: number, y: number, w: number, h: number, round: boolean) {
  const r = round ? Math.min(4, w / 2, h) : 0
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function Columns(props: { spec: ChartSpec }) {
  const { spec } = props
  const max = niceMax(Math.max(0, ...spec.points.map(sumOf)))
  const plotH = H - BOTTOM - TOP
  const band = (W - LEFT) / Math.max(1, spec.points.length)
  const barW = Math.min(24, band * 0.62)
  const every = Math.ceil(spec.points.length / 7)
  const y = (v: number) => TOP + plotH - (v / max) * plotH
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-hidden="true">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={LEFT}
            x2={W}
            y1={y(max * f)}
            y2={y(max * f)}
            className="grid"
          />
          <text
            x={LEFT - 6}
            y={y(max * f) + 3}
            className="axis"
            textAnchor="end"
          >
            {compact(spec.unit, max * f)}
          </text>
        </g>
      ))}
      {spec.points.map((p, i) => {
        const x = LEFT + i * band + (band - barW) / 2
        let base = 0
        const top = p.values.reduce((last, v, s) => (v > 0 ? s : last), -1)
        return (
          <g key={i} className="mark">
            <title>
              {`${p.label}: ${p.values
                .map((v, s) =>
                  spec.series.length > 1
                    ? `${spec.series[s]} ${chartValue(spec.unit, v)}`
                    : chartValue(spec.unit, v),
                )
                .join(', ')}`}
            </title>
            <rect
              x={LEFT + i * band}
              y={TOP}
              width={band}
              height={plotH}
              className="hit"
            />
            {p.values.map((v, s) => {
              if (v <= 0) return null
              const h = (v / max) * plotH
              // A 2px surface gap between stacked parts.
              const gap = s > 0 && base > 0 ? 2 : 0
              const yTop = y(base + v)
              base += v
              return (
                <path
                  key={s}
                  d={column(x, yTop, barW, Math.max(0, h - gap), s === top)}
                  className={`series-${s + 1}`}
                />
              )
            })}
            {i % every === 0 && (
              <text
                x={LEFT + i * band + band / 2}
                y={H - 4}
                className="axis"
                textAnchor="middle"
              >
                {p.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// One 2px line per series, money in over a soft wash of its own colour.
// Pointing at a day draws a guide and a label with every series' value
// for it, so the chart can be read without the axis.
function Lines(props: { spec: ChartSpec }) {
  const { spec } = props
  const wash = useId()
  const [at, setAt] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...spec.points.flatMap((p) => p.values)))
  const plotH = H - BOTTOM - TOP
  const n = spec.points.length
  const step = (W - LEFT - 36) / Math.max(1, n - 1)
  const every = Math.ceil(n / 7)
  const x = (i: number) =>
    LEFT + 18 + (n === 1 ? (W - LEFT - 36) / 2 : i * step)
  const y = (v: number) => TOP + plotH - (v / max) * plotH
  const line = (s: number) =>
    spec.points.map((p, i) => `${x(i)},${y(p.values[s] ?? 0)}`).join(' ')
  const point = at === null ? null : spec.points[at]
  return (
    <div className="chart-plot" onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-hidden="true">
        <defs>
          <linearGradient id={wash} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="wash-top" />
            <stop offset="100%" className="wash-bottom" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={LEFT}
              x2={W}
              y1={y(max * f)}
              y2={y(max * f)}
              className="grid"
            />
            <text
              x={LEFT - 6}
              y={y(max * f) + 3}
              className="axis"
              textAnchor="end"
            >
              {compact(spec.unit, max * f)}
            </text>
          </g>
        ))}
        {n > 1 && (
          <polygon
            points={`${x(0)},${y(0)} ${line(0)} ${x(n - 1)},${y(0)}`}
            fill={`url(#${wash})`}
            className="area"
          />
        )}
        {spec.series
          .map((_, s) => s)
          .reverse()
          .map((s) => (
            <polyline
              key={s}
              points={line(s)}
              className={`line series-${s + 1}`}
            />
          ))}
        {at !== null && (
          <line
            x1={x(at)}
            x2={x(at)}
            y1={TOP}
            y2={TOP + plotH}
            className="guide"
          />
        )}
        {spec.points.map((p, i) => (
          <g key={i} className="mark">
            <rect
              x={x(i) - step / 2}
              y={TOP}
              width={Math.max(step, 12)}
              height={plotH}
              className="hit"
              onMouseEnter={() => setAt(i)}
            />
            {(n <= 14 || i === at || i === n - 1) &&
              p.values.map((v, s) => (
                <circle
                  key={s}
                  cx={x(i)}
                  cy={y(v)}
                  r={i === at ? 5 : i === n - 1 ? 4 : 3}
                  className={`dot series-${s + 1}`}
                />
              ))}
            {i % every === 0 && (
              <text x={x(i)} y={H - 4} className="axis" textAnchor="middle">
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {point && at !== null && (
        <div
          className="chart-tip"
          style={{
            left: `${(x(at) / W) * 100}%`,
            transform: `translateX(${at > n / 2 ? 'calc(-100% - 8px)' : '8px'})`,
          }}
        >
          <strong>{point.label}</strong>
          {spec.series.map((name, s) => (
            <span key={name}>
              <i className={`key series-${s + 1}`} />
              {name} <b>{chartValue(spec.unit, point.values[s] ?? 0)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Bars(props: { spec: ChartSpec }) {
  const { spec } = props
  const max = Math.max(1, ...spec.points.map(sumOf))
  return (
    <ul className="chart-bars" aria-hidden="true">
      {spec.points.map((p) => (
        <li
          key={p.label}
          title={`${p.label}: ${chartValue(spec.unit, sumOf(p))}`}
        >
          <span className="label">{p.label}</span>
          <span className="track">
            <span
              className="bar series-1"
              style={{ width: `${(sumOf(p) / max) * 100}%` }}
            />
          </span>
          <span className="value">{chartValue(spec.unit, sumOf(p))}</span>
        </li>
      ))}
    </ul>
  )
}

// Every chart has the same parts: a title, a sentence saying what it shows,
// a legend when there is more than one series, and the numbers as a table.
export function Chart(props: { spec: ChartSpec }) {
  const { spec } = props
  const empty = spec.points.every((p) => sumOf(p) === 0)
  return (
    <figure className="chart" role="group" aria-label={spec.title}>
      <figcaption>
        <strong>{spec.title}</strong>
        <span className="hint">{spec.summary}</span>
      </figcaption>
      {empty ? (
        <p className="empty">Nothing to show for this period yet.</p>
      ) : (
        <>
          {spec.series.length > 1 && (
            <ul className="legend">
              {spec.series.map((s, i) => (
                <li key={s}>
                  <span className={`swatch series-${i + 1}`} /> {s}
                  {/* Lines run over time, so each series' total for the
                      period reads beside its name. */}
                  {spec.kind === 'lines' && (
                    <b>
                      {chartValue(
                        spec.unit,
                        spec.points.reduce((n, p) => n + (p.values[i] ?? 0), 0),
                      )}
                    </b>
                  )}
                </li>
              ))}
            </ul>
          )}
          {spec.kind === 'columns' ? (
            <Columns spec={spec} />
          ) : spec.kind === 'lines' ? (
            <Lines spec={spec} />
          ) : (
            <Bars spec={spec} />
          )}
          <details className="chart-table">
            <summary>Show as a table</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col"></th>
                  {spec.series.map((s) => (
                    <th key={s} scope="col">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.points.map((p) => (
                  <tr key={p.label}>
                    <th scope="row">{p.label}</th>
                    {p.values.map((v, i) => (
                      <td key={i}>{chartValue(spec.unit, v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  )
}
