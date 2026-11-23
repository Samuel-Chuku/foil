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

// One 2px line per series with a marker on each day; markers are ringed in
// the surface colour so crossing lines stay readable.
function Lines(props: { spec: ChartSpec }) {
  const { spec } = props
  const max = niceMax(Math.max(0, ...spec.points.flatMap((p) => p.values)))
  const plotH = H - BOTTOM - TOP
  const n = spec.points.length
  const step = (W - LEFT - 36) / Math.max(1, n - 1)
  const every = Math.ceil(n / 7)
  const x = (i: number) =>
    LEFT + 18 + (n === 1 ? (W - LEFT - 36) / 2 : i * step)
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
      {spec.series.map((_, s) => (
        <polyline
          key={s}
          points={spec.points
            .map((p, i) => `${x(i)},${y(p.values[s] ?? 0)}`)
            .join(' ')}
          className={`line series-${s + 1}`}
        />
      ))}
      {spec.points.map((p, i) => (
        <g key={i} className="mark">
          <title>
            {`${p.label}: ${p.values
              .map((v, s) => `${spec.series[s]} ${chartValue(spec.unit, v)}`)
              .join(', ')}`}
          </title>
          <rect
            x={x(i) - step / 2}
            y={TOP}
            width={Math.max(step, 12)}
            height={plotH}
            className="hit"
          />
          {n <= 14 &&
            p.values.map((v, s) => (
              <circle
                key={s}
                cx={x(i)}
                cy={y(v)}
                r={3.5}
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
