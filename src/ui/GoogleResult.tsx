import type { GoogleStatus } from './useGoogle'

// The outcome of a send to the vendor's Sheets or Calendar, in place.
export function GoogleResult(props: { status: GoogleStatus | undefined }) {
  const s = props.status
  if (!s) return null
  if (s.kind === 'busy') return <p className="hint">{s.note}</p>
  if (s.kind === 'error') {
    return (
      <p className="error" role="alert">
        {s.message}
      </p>
    )
  }
  return (
    <p className="hint" aria-live="polite">
      {s.text}{' '}
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer">
          Open it
        </a>
      )}
    </p>
  )
}
