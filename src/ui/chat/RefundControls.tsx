import { type ExtraRow } from '../../ledger/settle'
import type { OpenChat } from '../host'
import { type LedgerApi } from '../useLedger'
import { Badge } from '../Badge'

import type { ChatDesk } from './useChatDesk'

// Under a refund owed in this chat: read the account from the chat, let the
// vendor check it, then keep it with the refund on this computer.
export function RefundControls(props: {
  row: ExtraRow
  chat: OpenChat
  desk: ChatDesk
  ledger: LedgerApi
  busy: boolean
}) {
  const { row, chat, desk, ledger, busy } = props
  const { current, patch, readRefund, editRefund } = desk
  if (row.settlement?.state !== 'refund owed') return null
  const r = current.refund?.key === row.key ? current.refund : undefined
  if (r?.status === 'running') return <p aria-live="polite">{r.note}</p>
  if (r?.status === 'done') {
    const form = r.value.form
    return (
      <form
        className="order-form"
        onSubmit={(e) => {
          e.preventDefault()
          void ledger
            .setRefundTo(row.key, form)
            .then(() => patch(chat.phone, { refund: undefined }))
        }}
      >
        <Badge source={r.value.source} ms={r.value.ms} />
        <p className="hint">
          Check these against the chat before you send any money.
        </p>
        {(
          [
            ['accountNumber', 'Account number'],
            ['bank', 'Bank'],
            ['accountName', 'Account name'],
          ] as const
        ).map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              value={form[k]}
              inputMode={k === 'accountNumber' ? 'numeric' : undefined}
              onChange={(e) => editRefund({ ...form, [k]: e.target.value })}
            />
          </label>
        ))}
        <button type="submit">Save account</button>{' '}
        <button
          type="button"
          className="quiet"
          onClick={() => patch(chat.phone, { refund: undefined })}
        >
          Discard
        </button>
      </form>
    )
  }
  return (
    <>
      {r?.status === 'error' && (
        <p className="error" role="alert">
          {r.message}
        </p>
      )}
      <button
        type="button"
        className="quiet"
        disabled={busy}
        onClick={() => void readRefund(row.key)}
      >
        {row.settlement.refundTo
          ? 'Read the account again'
          : 'Read refund account from chat'}
      </button>
    </>
  )
}
