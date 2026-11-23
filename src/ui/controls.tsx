import { useId, type ReactNode } from 'react'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// A row of choices drawn as one segmented control, built on radio inputs so
// arrow keys and screen readers treat it as one choice.
export function Segmented<T extends string>(props: {
  legend: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label?: (v: T) => ReactNode
}) {
  const name = useId()
  return (
    <fieldset className="setting">
      <legend>{props.legend}</legend>
      <div className="segmented">
        {props.options.map((o) => (
          <label key={o}>
            <input
              type="radio"
              name={name}
              value={o}
              checked={props.value === o}
              onChange={() => props.onChange(o)}
            />
            <span>{props.label ? props.label(o) : cap(o)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Slider(props: {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  unit: string
  onChange: (v: number) => void
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="setting">
      <div className="setting-head">
        <label htmlFor={id}>{props.label}</label>
        <output htmlFor={id} className="num">
          {props.value}
          {props.unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={props.range.min}
        max={props.range.max}
        step={props.range.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  )
}

export function Switch(props: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: ReactNode
}) {
  return (
    <div className="setting">
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span>{props.label}</span>
      </label>
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  )
}
