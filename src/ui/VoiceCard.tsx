import type { ReactNode } from 'react'
import type { Reading } from '../ai/run'
import type { VoiceNote } from '../capture/voice'

export type VoiceStep =
  | { status: 'running'; note: string }
  | { status: 'done'; value: Reading<VoiceNote>; used: boolean }
  | { status: 'error'; message: string }

// What a voice note said, heard in the cloud after the vendor approved it.
// Unclear parts are marked so they are confirmed, never assumed.
export function VoiceCard(props: {
  step: VoiceStep
  badge: (r: Reading<unknown>) => ReactNode
  hasForm: boolean
  onUse: () => void
  onStreet: (known: string) => void
  onClose: () => void
}) {
  const { step } = props
  return (
    <section className="card voice" aria-labelledby="voice-h">
      <h3 id="voice-h">Voice note</h3>
      {step.status === 'running' && <p aria-live="polite">{step.note}</p>}
      {step.status === 'error' && (
        <p className="error" role="alert">
          {step.message}
        </p>
      )}
      {step.status === 'done' && (
        <VoiceResult
          note={step.value.fields}
          badge={props.badge(step.value)}
          used={step.used}
          hasForm={props.hasForm}
          onUse={props.onUse}
          onStreet={props.onStreet}
        />
      )}
      {step.status !== 'running' && (
        <button type="button" className="link" onClick={props.onClose}>
          Close
        </button>
      )}
    </section>
  )
}

function VoiceResult(props: {
  note: VoiceNote
  badge: ReactNode
  used: boolean
  hasForm: boolean
  onUse: () => void
  onStreet: (known: string) => void
}) {
  const { note } = props
  const unsure = (name: string) => note.unsure.includes(name)
  const o = note.order
  const place = [o.address, o.landmark, o.area, o.state]
    .filter(Boolean)
    .join(', ')
  return (
    <>
      {props.badge}
      {note.gloss && <p>{note.gloss}</p>}
      <dl className="fields">
        {note.language && (
          <>
            <dt>Spoken in</dt>
            <dd>{note.language}</dd>
          </>
        )}
        {o.items.map((i, n) => (
          <div key={n} style={{ display: 'contents' }}>
            <dt>Item {n + 1}</dt>
            <dd>
              {i.quantity || '?'} x {i.name}
              {(unsure(i.name) || unsure('quantity')) && (
                <span className="tag unsure"> unclear</span>
              )}
            </dd>
          </div>
        ))}
        {(place || o.deliveryChoice) && (
          <>
            <dt>Where</dt>
            <dd>
              {[o.deliveryChoice, place].filter(Boolean).join(': ')}
              {['address', 'area', 'state', 'landmark'].some(unsure) && (
                <span className="tag unsure"> unclear</span>
              )}
            </dd>
          </>
        )}
        {note.street && (
          <>
            <dt>Street</dt>
            <dd>
              Heard as &ldquo;{note.street.heard}&rdquo;, which the desk cannot
              check, so the reply will ask the customer to confirm it.
              {note.street.suggestion && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => props.onStreet(note.street!.suggestion!)}
                  >
                    It is {note.street.suggestion}
                  </button>
                </>
              )}
            </dd>
          </>
        )}
        {note.question && (
          <>
            <dt>They asked</dt>
            <dd>{note.question}</dd>
          </>
        )}
      </dl>
      {note.unsure.length > 0 && (
        <p className="hint">
          Parts were unclear. The reply draft will ask the customer to confirm
          them.
        </p>
      )}
      <p className="hint">
        Prices come from your stock list, never from the voice note.
      </p>
      {o.items.length > 0 || place ? (
        <button type="button" disabled={props.used} onClick={props.onUse}>
          {props.used
            ? 'Added to the order'
            : props.hasForm
              ? 'Add to the order below'
              : 'Start an order from this'}
        </button>
      ) : null}
    </>
  )
}
