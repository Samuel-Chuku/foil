import type { SampleReceipt } from '../sample/pack'
import { Icon } from '../ui/icons'
import { SourceBadge } from '../ui/SourceBadge'
import { StatePill } from '../ui/ProofPair'

// The last few characters of a long transfer ID, as a receipt shows it at a
// glance.
const tail = (id: string) => (id.length > 8 ? `…${id.slice(-6)}` : id)

// The first thing a visitor sees: what Foil is, how it keeps customers'
// details private, a guided start on the sample day, and how to put it on
// their own WhatsApp.
export function DemoIntro(props: {
  first: string
  shop: string
  city: string
  bank: string
  // The first customer's receipt, so the picture shows the sample day.
  receipt: SampleReceipt | null
  onStart: () => void
  onSkip: () => void
}) {
  const r = props.receipt
  const id = r ? r.sessionId || r.reference : ''
  return (
    <section className="first-run" aria-labelledby="intro-h">
      <div className="fr-hero">
        <div className="fr-copy">
          <p className="fr-brand">
            <span className="fr-mark" aria-hidden="true" />
            Foil
          </p>
          <h2 id="intro-h">Did the money actually land?</h2>
          <p className="fr-lede">
            Shops that sell on WhatsApp are paid by instant transfer, and
            customers send a screenshot as proof. Foil sits beside WhatsApp Web,
            checks each receipt against the shop&apos;s own bank alerts, then
            captures the order and drafts the reply, so the vendor only has to
            read, check and send.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={props.onStart}>
              Start with {props.first}&apos;s chat
            </button>
            <button type="button" className="quiet" onClick={props.onSkip}>
              Look around on my own
            </button>
          </div>
          <p className="hint">
            A sample day at {props.shop} in {props.city}. Every name, number and
            receipt here is invented, and nothing leaves this browser unless you
            approve it.
          </p>
        </div>

        {r && (
          <figure className="fr-proof">
            <div className="fr-slip">
              <p className="fr-label">Receipt from {props.first}</p>
              <p className="fr-amount">{r.amountText}</p>
              <p>{r.sender}</p>
              {id && <p className="fr-id">{tail(id)}</p>}
            </div>
            <div className="fr-slip">
              <p className="fr-label">Your {props.bank} alert</p>
              <p className="fr-amount">{r.amountText}</p>
              <p>{r.sender}</p>
              {id && <p className="fr-id">{tail(id)}</p>}
            </div>
            <figcaption>
              <StatePill state="landed" />
              Same amount, sender and transfer ID, so the money is in the
              shop&apos;s account.
            </figcaption>
          </figure>
        )}
      </div>

      <h3>How Foil works</h3>
      <ol className="fr-steps">
        <li>
          <Icon name="receipt" size={20} />
          <strong>Read</strong>
          <span>
            Chrome&apos;s built-in model reads the receipt screenshot on this
            computer.
          </span>
        </li>
        <li>
          <Icon name="rules" size={20} />
          <strong>Match</strong>
          <span>
            Plain rules, never the model, compare it with the shop&apos;s bank
            alerts: amount, sender, transfer ID and time.
          </span>
        </li>
        <li>
          <Icon name="chat" size={20} />
          <strong>Reply</strong>
          <span>
            Foil captures the order and puts a draft in the message box. You
            press send.
          </span>
        </li>
      </ol>

      <h3>Where each job runs</h3>
      <div className="fr-split">
        <div>
          <h4>
            <SourceBadge source="On device" /> On this computer
          </h4>
          <p>
            Receipts, chats, bank alerts, customer names, phone numbers and
            addresses. Nothing about a customer leaves the machine.
          </p>
        </div>
        <div>
          <h4>
            <SourceBadge source="Cloud" /> In Google&apos;s cloud, after you
            approve
          </h4>
          <p>
            Voice notes, questions about the books and replies in languages the
            built-in model lacks. You see exactly what will be sent first, with
            names swapped out.
          </p>
        </div>
      </div>

      <h3>Try the sample day</h3>
      <ol className="fr-try">
        <li>
          In {props.first}&apos;s chat, click <strong>Verify payment</strong>{' '}
          under the receipt.
        </li>
        <li>
          Click <strong>Capture order from chat</strong>, then{' '}
          <strong>Draft a reply</strong>, and watch the reply appear in the
          message box, unsent.
        </li>
        <li>
          Open the <strong>Inbox</strong> and choose{' '}
          <strong>Let time pass</strong>: late bank alerts arrive, and waiting
          orders turn paid on their own.
        </li>
        <li>
          Look through <strong>Today</strong>, <strong>Money</strong> and{' '}
          <strong>Shop</strong> in the panel for the books, charts and receipts.
        </li>
      </ol>
      <p className="hint">
        Choose another city at the top to see the same flow with UPI in Mumbai
        or Pix in São Paulo. Without Chrome&apos;s built-in model, the panel
        asks before using the cloud instead.
      </p>

      <h3>Use it on your own WhatsApp</h3>
      <ol className="fr-try">
        <li>
          Get the code from the project&apos;s GitHub repository and follow its
          README to connect your own Firebase project.
        </li>
        <li>
          Build the extension, open <code>chrome://extensions</code>, turn on
          Developer mode and load the <code>dist-extension</code> folder.
        </li>
        <li>
          Open WhatsApp Web, then Foil&apos;s side panel. A short Getting
          started card walks you through bank alerts and your shop&apos;s
          details.
        </li>
      </ol>
    </section>
  )
}
