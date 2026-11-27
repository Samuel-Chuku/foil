import { Icon } from '../icons'
import { Badge } from '../Badge'
import { Where } from '../Where'
import { listSaid } from '../../capture/forward'
import type { ChatDesk } from './useChatDesk'

// A message the vendor forwarded from WhatsApp, with what the desk can do
// with it: add it to the order, ask about it, or keep it as a note. Only this
// message came from WhatsApp; the rest of the chat was not read.
export function ForwardCard(props: {
  desk: ChatDesk
  customer: string
  busy: boolean
  onAsk: () => void
  onClose: () => void
}) {
  const { desk, busy } = props
  const f = desk.current.forward
  if (!f) return null
  const { message, add } = f
  const who = message.from === 'customer' ? props.customer : 'You'
  return (
    <section
      className="card forward"
      data-tone="order"
      aria-labelledby="forward-h"
    >
      <h3 id="forward-h">
        <Icon name="forward" />
        Forwarded to Foil
      </h3>
      <blockquote className="forward-quote">
        <p>{message.text}</p>
        <footer>
          {message.part ? 'Part of a message from ' : 'From '}
          {who}
          {message.time && ` · ${message.time}`}
        </footer>
      </blockquote>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy || add?.status === 'running'}
          onClick={() => void desk.addForwarded()}
        >
          Add to this order
          <Where where={['device']} />
        </button>
        <button type="button" className="quiet" onClick={props.onAsk}>
          <Icon name="spark" />
          Ask Foil about it
        </button>
        <button
          type="button"
          className="quiet"
          disabled={f.kept}
          onClick={() => void desk.keepForwarded()}
        >
          <Icon name="note" />
          {f.kept ? 'Kept as a note' : 'Keep as a note'}
        </button>
      </div>
      {add?.status === 'running' && <p aria-live="polite">{add.note}</p>}
      {add?.status === 'error' && (
        <p className="error" role="alert">
          {add.message}
        </p>
      )}
      {add?.status === 'done' && (
        <div aria-live="polite">
          <Badge source={add.value.source} ms={add.value.ms} />
          <p>
            {add.value.added.length > 0
              ? `Added ${listSaid(add.value.added)} to the order below. Check it before you save.`
              : 'Nothing new for the order in this message; it already has what it says.'}
          </p>
        </div>
      )}
      <button type="button" className="link" onClick={props.onClose}>
        Close
      </button>
    </section>
  )
}

// Messages kept as notes on this customer, newest last.
export function NotesCard(props: {
  desk: ChatDesk
  onDrop: (id: string) => void
}) {
  const { notes } = props.desk
  if (notes.length === 0) return null
  return (
    <section className="card notes" data-tone="order" aria-labelledby="notes-h">
      <h3 id="notes-h">
        <Icon name="note" />
        Notes on this customer
      </h3>
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            <p>{n.text}</p>
            <span className="hint">
              {n.from === 'customer' ? 'They said' : 'You said'}
              {n.time && ` at ${n.time}`}
              {' · '}
              <button
                type="button"
                className="link"
                onClick={() => props.onDrop(n.id)}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">Kept on this computer only.</p>
    </section>
  )
}
