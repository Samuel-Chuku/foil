import { formatWait, waitingMin } from '../../capture/followUp'
import { useShopClock } from '../useShopClock'
import { declineCredits, undoDecline } from '../../ledger/ledger'
import { type Verdict } from '../../verify/match'
import { formatMoney } from '../../verify/money'
import type { OpenChat } from '../host'
import { ExtraMoney } from '../ExtraMoney'
import { MONEY_STATE, STATE_WORDS } from '../moneyState'
import { ProofPair, StatePill } from '../ProofPair'
import { market } from '../../config/market'
import { REF_LABEL } from '../../verify/sessionId'
import type { ShopRulesApi } from '../useShopRules'
import { type LedgerApi } from '../useLedger'
import { Icon } from '../icons'
import { Badge } from '../Badge'

import type { ChatDesk } from './useChatDesk'
import { RefundControls } from './RefundControls'

// The payment for the open chat: the receipt checked against the money
// that landed, the credits to choose between, and extra money from them.
export function PaymentCard(props: {
  chat: OpenChat
  desk: ChatDesk
  ledger: LedgerApi
  shop: ShopRulesApi
  // A model step is running; buttons that start another wait for it.
  busy: boolean
}) {
  const { chat, desk, ledger, shop, busy } = props
  const { data, config } = ledger
  const { current, order, hasReceipt, chatRows, settle } = desk
  const { verify, capture, pickCredit, answerCredits } = desk
  const now = useShopClock().now()
  const v = current.verify
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Not recognised'
  // The order's own payment wins once it is newer than the receipt read in
  // this chat: the rules re-check orders when money arrives, and the vendor
  // may have picked a credit since.
  const fromOrder =
    order?.receipt &&
    order.payment.checkedAt !== null &&
    (v?.status !== 'done' || order.payment.checkedAt > v.value.checkedAt)
  const shown: {
    kind: Verdict['kind']
    text: string
    candidates: string[]
  } | null =
    fromOrder && order.payment.state !== 'awaiting'
      ? {
          kind: order.payment.state,
          text:
            order.payment.reason ??
            (order.payment.state === 'matched'
              ? 'The money is in your account.'
              : ''),
          candidates:
            order.payment.state === 'check' ? order.payment.candidates : [],
        }
      : v?.status === 'done'
        ? {
            kind: v.value.verdict.kind,
            text:
              v.value.verdict.kind === 'matched'
                ? v.value.verdict.notes.join(' ') ||
                  'The money is in your account.'
                : v.value.verdict.reason,
            candidates:
              v.value.verdict.kind === 'check'
                ? v.value.verdict.candidates
                : [],
          }
        : null
  // The two sides of the proof pair: what the receipt claims and the credit
  // the bank confirmed, if any.
  const proofReceipt =
    (fromOrder ? order?.receipt : null) ??
    (v?.status === 'done' ? v.value.receipt : null) ??
    order?.receipt ??
    null
  const proofCreditId =
    fromOrder && order?.payment.state === 'matched'
      ? order.payment.creditId
      : v?.status === 'done' && v.value.verdict.kind === 'matched'
        ? v.value.verdict.creditId
        : null
  const proofCredit = data?.credits.find((c) => c.id === proofCreditId) ?? null
  // How long this customer has waited on money that has not landed.
  const waited = order ? waitingMin(order, now) : null
  const canRecheck =
    order?.receipt != null &&
    (order.payment.state === 'not yet credited' ||
      (order.payment.state === 'check' && order.payment.decidedBy !== 'vendor'))
  const paidWhileAway = order !== null && ledger.justPaid.includes(order.id)
  return (
    <>
      {/* Always mounted, so a screen reader hears each change; a
        live region that appears with its text is often missed. */}
      <p className="visually-hidden" role="status">
        {v?.status === 'running'
          ? v.note
          : shown
            ? `Payment: ${STATE_WORDS[MONEY_STATE[shown.kind]]}. ${shown.text}`
            : ''}
      </p>
      <section className="card" data-tone="pay" aria-labelledby="pay-h">
        <h3 id="pay-h">
          <Icon name="receipt" />
          Payment
        </h3>
        {!hasReceipt && (
          <p className="empty">
            {chat?.messages.length === 0
              ? 'Click Verify payment under a receipt in the chat to check it.'
              : 'No receipt in this chat yet.'}
          </p>
        )}
        {hasReceipt && v?.status !== 'running' && (
          <button type="button" disabled={busy} onClick={() => void verify()}>
            {v ? 'Verify again' : 'Verify payment'}
          </button>
        )}
        {data?.credits.length === 0 && (
          <p className="hint">
            No bank alerts have arrived yet, so nothing can match. The order is
            checked again as soon as one does.
          </p>
        )}
        {v?.status === 'running' && <p>{v.note}</p>}
        {v?.status === 'error' && (
          <p className="error" role="alert">
            {v.message}
          </p>
        )}
        {v?.status === 'done' && (
          <Badge source={v.value.reading.source} ms={v.value.reading.ms} />
        )}
        {shown && (
          <div className="verdict" data-kind={shown.kind}>
            <ProofPair
              state={MONEY_STATE[shown.kind]}
              receipt={proofReceipt}
              credit={proofCredit}
              bankName={bankName}
            />
            <StatePill state={MONEY_STATE[shown.kind]} />
            {paidWhileAway && (
              <p>
                <strong>
                  Paid while you waited: the alert arrived after the receipt was
                  checked.
                </strong>
              </p>
            )}
            <p>{shown.text}</p>
            {fromOrder && waited !== null && (
              <p className="hint">
                Waiting {formatWait(waited)}
                {waited > shop.rules.paymentWaitMin
                  ? `, past your ${formatWait(shop.rules.paymentWaitMin)} wait. A draft will ask them to check with their bank.`
                  : '.'}
              </p>
            )}
            {fromOrder && canRecheck && (
              <button
                type="button"
                className="quiet"
                onClick={() => void ledger.recheck()}
              >
                Check again
              </button>
            )}
            {current.notice && (
              <p className="error" role="alert">
                {current.notice}
              </p>
            )}
            {shown.candidates.length > 0 &&
              (order ? (
                <>
                  <ul className="candidates">
                    {shown.candidates.map((id) => {
                      const cr = data?.credits.find((x) => x.id === id)
                      return (
                        <li key={id}>
                          {cr
                            ? `${formatMoney(cr.amountKobo)} from ${cr.sender || 'an unknown sender'}`
                            : id}{' '}
                          <button
                            type="button"
                            onClick={() => void pickCredit(id)}
                          >
                            {shown.candidates.length === 1
                              ? 'Yes, this is theirs'
                              : 'This one'}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => void answerCredits(declineCredits)}
                  >
                    {shown.candidates.length === 1
                      ? 'No, not theirs'
                      : 'None of these is theirs'}
                  </button>
                  {order.payment.checkWhy === 'name' && (
                    <p className="hint">
                      Not sure? Draft a reply: it asks them whose account the
                      money came from, in case someone paid for them.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="hint">
                    Capture the order first, then confirm whether this money is
                    theirs.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void capture()}
                  >
                    Capture the order
                  </button>
                </>
              ))}
            {fromOrder &&
              order.payment.state === 'not yet credited' &&
              (order.payment.declinedIds?.length ?? 0) > 0 && (
                <p className="hint">
                  A draft will ask which account they paid from, so the money
                  can be traced.{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => void answerCredits(undoDecline)}
                  >
                    Undo my answer
                  </button>
                </p>
              )}
          </div>
        )}
        {v?.status === 'done' && (
          <details className="read-fields">
            <summary>Everything read from the receipt</summary>
            <dl className="fields">
              <dt>Amount</dt>
              <dd>
                {v.value.receipt.amountKobo === null
                  ? 'Not read'
                  : formatMoney(v.value.receipt.amountKobo)}
              </dd>
              <dt>Sender</dt>
              <dd>{v.value.receipt.sender || 'Not read'}</dd>
              <dt>Bank</dt>
              <dd>{bankName(v.value.receipt.senderBank)}</dd>
              <dt>
                {REF_LABEL[market().rail].replace(/^\w/, (c) =>
                  c.toUpperCase(),
                )}
              </dt>
              <dd className="mono">
                {v.value.reading.fields.sessionId || 'Not printed'}
              </dd>
              <dt>Time</dt>
              <dd>{v.value.reading.fields.dateTime || 'Not read'}</dd>
            </dl>
          </details>
        )}
        {chatRows.length > 0 && (
          <div className="extra-here">
            <p>
              <strong>Extra money from this customer</strong>
            </p>
            <ExtraMoney
              rows={chatRows}
              onSettle={settle}
              onUndo={(id) => void ledger.unsettle(id)}
              more={(row) => (
                <RefundControls
                  row={row}
                  chat={chat}
                  desk={desk}
                  ledger={ledger}
                  busy={busy}
                />
              )}
            />
          </div>
        )}
      </section>
    </>
  )
}
