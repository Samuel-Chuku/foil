import { Icon } from '../icons'
import { Badge } from '../Badge'

import type { ChatDesk } from './useChatDesk'

// The reply: a draft placed in the message box, never sent, and the
// vendor's own words reworded or the customer's put into English.
export function DraftCard(props: {
  desk: ChatDesk
  // A model step is running; buttons that start another wait for it.
  busy: boolean
}) {
  const { desk, busy } = props
  const { current, draft, translate, undoRewrite } = desk
  const d = current.draft
  return (
    <>
      <section className="card" data-tone="reply" aria-labelledby="draft-h">
        <h3 id="draft-h">
          <Icon name="reply" />
          Reply
        </h3>
        <div className="actions reply-actions">
          {d?.status !== 'running' && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void draft()}
            >
              {d?.status === 'done' ? 'Draft again' : 'Draft a reply'}
            </button>
          )}
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={() => void translate()}
          >
            <Icon name="globe" />
            Translate their messages
          </button>
        </div>
        {d?.status === 'running' && <p>{d.note}</p>}
        {d?.status === 'error' && (
          <p className="error" role="alert">
            {d.message}
          </p>
        )}
        {d?.status === 'done' && (
          <>
            <Badge source={d.value.source} ms={d.value.ms} />
            <p>
              The draft is in the message box. It has not been sent; edit it or
              send it yourself.
            </p>
          </>
        )}
        {current.rewrite?.status === 'running' && (
          <p aria-live="polite">{current.rewrite.note}</p>
        )}
        {current.rewrite?.status === 'error' && (
          <p className="error" role="alert">
            {current.rewrite.message}
          </p>
        )}
        {current.rewrite?.status === 'done' && (
          <div className="rewrite-result" aria-live="polite">
            <Badge
              source={current.rewrite.value.reading.source}
              ms={current.rewrite.value.reading.ms}
            />
            <p>
              {current.rewrite.value.undone
                ? 'Your own words are back in the message box.'
                : `Reworded: ${current.rewrite.value.label}. It is in the message box, not sent.`}
            </p>
            {!current.rewrite.value.undone &&
              current.rewrite.value.lost.length > 0 && (
                <p className="error" role="alert">
                  The rewrite left out {current.rewrite.value.lost.join(', ')}.
                  Check it before you send, or put back what you wrote.
                </p>
              )}
            {!current.rewrite.value.undone && (
              <button
                type="button"
                className="quiet"
                onClick={() => void undoRewrite()}
              >
                Put back what I wrote
              </button>
            )}
          </div>
        )}
        {current.translate?.status === 'running' && (
          <p aria-live="polite">{current.translate.note}</p>
        )}
        {current.translate?.status === 'error' && (
          <p className="error" role="alert">
            {current.translate.message}
          </p>
        )}
        {current.translate?.status === 'done' && (
          <div className="translation" aria-live="polite">
            <h4>What they said, in English</h4>
            <p>{current.translate.value.fields}</p>
            <Badge
              source={current.translate.value.source}
              ms={current.translate.value.ms}
            />
          </div>
        )}
      </section>
    </>
  )
}
