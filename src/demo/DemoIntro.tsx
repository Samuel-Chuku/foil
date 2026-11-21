// The first thing a visitor to the hosted demo sees: what the desk is for,
// how it keeps customers' details private, and a short path through the
// sample day. Plain structure; the design system styles it later.
export function DemoIntro(props: { onStart: () => void; onSkip: () => void }) {
  return (
    <section className="demo-intro" aria-labelledby="intro-h">
      <h2 id="intro-h">Did the money actually land?</h2>
      <p>
        Small businesses that sell on WhatsApp are paid by bank transfer, and
        customers send a screenshot as proof. This desk sits beside WhatsApp Web
        and checks each receipt against the shop&apos;s own bank alerts, then
        captures the order and drafts the reply, so the vendor only has to read,
        check and send.
      </p>

      <h3>How it keeps customers&apos; details private</h3>
      <ul>
        <li>
          Receipts, chats and bank alerts are read by the AI model built into
          Chrome, on this computer. Those results carry an{' '}
          <strong>On device</strong> badge.
        </li>
        <li>
          Voice notes and questions about the books go to Google&apos;s cloud
          model only after you see exactly what will be sent and approve it.
          Those results carry a <strong>Cloud</strong> badge.
        </li>
        <li>
          Payment decisions are made by plain rules, never by the model, and the
          books in the cloud hold amounts and states, never names.
        </li>
      </ul>

      <h3>Try the sample day</h3>
      <ol>
        <li>
          In Adaeze&apos;s chat, click <strong>Verify payment</strong> under her
          receipt.
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
        Everything here is invented, and it stays in this browser. Without
        Chrome&apos;s built-in model, the panel asks before using the cloud
        instead.
      </p>

      <div className="actions">
        <button type="button" onClick={props.onStart}>
          Start with Adaeze&apos;s chat
        </button>
        <button type="button" className="quiet" onClick={props.onSkip}>
          Look around on my own
        </button>
      </div>
    </section>
  )
}
