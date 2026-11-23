import { useState } from 'react'
import type { Brand } from '../capture/brand'
import {
  receiptText,
  receiptTitle,
  type CustomerReceipt,
} from '../capture/customerReceipt'
import { formatMoney } from '../verify/money'
import { receiptBlob } from './receiptImage'
import { useReceiptPicture } from './useReceiptPicture'
import { Icon } from './icons'

type Note = { kind: 'ok' | 'error'; text: string }

const canCopyImage = () =>
  typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

// A receipt for the customer once their money has landed, as text for the
// message box and as a picture to paste or save. Made on this computer; the
// vendor sends it, never the desk.
export function ReceiptCard(props: {
  receipt: CustomerReceipt
  brand: Brand
  onInsert: (text: string) => Promise<void>
}) {
  // The shop may keep order numbers off what customers see.
  const receipt = props.brand.showOrderNumber
    ? props.receipt
    : { ...props.receipt, orderCode: '' }
  const picture = useReceiptPicture(receipt, props.brand)
  const [note, setNote] = useState<Note | null>(null)
  const fileName = `receipt-order-${props.receipt.orderCode}.png`

  async function copy() {
    if (!picture) return
    try {
      const blob = await receiptBlob(picture.canvas)
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      setNote({
        kind: 'ok',
        text: "Copied. Click the chat's message box and press Ctrl+V, then send it yourself.",
      })
    } catch {
      setNote({
        kind: 'error',
        text: 'The picture could not be copied here. Download it instead and attach it in the chat.',
      })
    }
  }

  function download() {
    if (!picture) return
    const link = document.createElement('a')
    link.href = picture.src
    link.download = fileName
    link.click()
  }

  async function insert() {
    try {
      await props.onInsert(receiptText(receipt))
      setNote({
        kind: 'ok',
        text: 'The receipt is in the message box. It has not been sent.',
      })
    } catch (e) {
      setNote({
        kind: 'error',
        text:
          e instanceof Error ? e.message : 'The receipt could not be placed.',
      })
    }
  }

  return (
    <section
      className="card receipt"
      data-tone="pay"
      aria-labelledby="receipt-h"
    >
      <h3 id="receipt-h">
        <Icon name="receipt" />
        Receipt for the customer
      </h3>
      <p className="hint">
        {receiptTitle(receipt)}: {formatMoney(receipt.paidKobo)}
        {receipt.owedKobo > 0 &&
          `, ${formatMoney(receipt.owedKobo)} still to pay`}
        . Made on this computer from the order and your bank alert.
      </p>
      {!receipt.shop && (
        <p className="hint">
          Add your shop name under Shop rules to show it on receipts.
        </p>
      )}
      {picture ? (
        <img
          src={picture.src}
          alt={`${receiptTitle(receipt)} for order ${props.receipt.orderCode}, ${formatMoney(receipt.paidKobo)} paid`}
          className="receipt-preview"
        />
      ) : (
        <p className="hint" aria-live="polite">
          Drawing the receipt…
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={() => void insert()}>
          Put the text in the reply box
        </button>
        {canCopyImage() && (
          <button
            type="button"
            className="quiet"
            disabled={!picture}
            onClick={() => void copy()}
          >
            Copy the picture
          </button>
        )}
        <button
          type="button"
          className="quiet"
          disabled={!picture}
          onClick={download}
        >
          Download the picture
        </button>
      </div>
      {note && (
        <p
          className={note.kind === 'error' ? 'error' : 'hint'}
          role={note.kind === 'error' ? 'alert' : 'status'}
        >
          {note.text}
        </p>
      )}
    </section>
  )
}
