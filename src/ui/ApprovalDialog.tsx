import { useEffect, useRef } from 'react'
import { base64Bytes, sizeText, type CloudRequest } from '../cloud/approval'

export function ApprovalDialog(props: {
  request: CloudRequest
  onSend: () => void
  onCancel: () => void
}) {
  const { request } = props
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const a = request.attachment
  const audioUrl =
    a?.kind === 'audio' ? `data:${a.mimeType};base64,${a.base64}` : null
  return (
    <dialog
      ref={ref}
      className="approval"
      aria-labelledby="approval-h"
      onCancel={(e) => {
        e.preventDefault()
        props.onCancel()
      }}
    >
      <h3 id="approval-h">{request.feature}: send to the cloud?</h3>
      <p>
        {request.reason} This goes to Google&apos;s Gemini service. Below is
        everything that will be sent, exactly as it will be sent.
      </p>
      {request.replaced.length > 0 && (
        <p className="hint">
          Replaced with neutral labels before sending:{' '}
          {request.replaced.join(', ')}.
        </p>
      )}
      <div className="approval-body">
        {request.texts.map((t, n) => (
          <pre key={n}>{t}</pre>
        ))}
        {a && (
          <figure>
            <figcaption>
              {a.label} ({a.mimeType}, {sizeText(base64Bytes(a.base64))})
            </figcaption>
            {audioUrl && (
              <audio controls src={audioUrl}>
                Your browser cannot play this audio.
              </audio>
            )}
            {a.kind === 'image' && (
              <img
                src={`data:${a.mimeType};base64,${a.base64}`}
                alt={a.label}
              />
            )}
          </figure>
        )}
      </div>
      <div className="actions">
        <button type="button" className="quiet" onClick={props.onCancel}>
          Cancel, send nothing
        </button>
        <button type="button" onClick={props.onSend}>
          Send this
        </button>
      </div>
    </dialog>
  )
}
