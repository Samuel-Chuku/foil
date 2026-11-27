import type { Reading } from '../../ai/run'
import type { Forwarded } from '../../capture/forward'
import type { RefundTo } from '../../ledger/types'
import type { VoiceNote } from '../../capture/voice'
import type { RawReceipt } from '../../verify/receiptFields'
import type { Verdict } from '../../verify/match'
import type { Receipt } from '../../verify/types'
import type { DeliveryForm } from '../deliveryForm'
import type { VoiceStep } from '../VoiceCard'

// What the chat desk is doing for each chat, by phone: a step per action,
// and what the vendor has read and checked so far.

export type Step<T> =
  | { status: 'running'; note: string }
  | { status: 'done'; value: T }
  | { status: 'error'; message: string }

export type Verified = {
  reading: Reading<RawReceipt>
  receipt: Receipt
  verdict: Verdict
  checkedAt: number
}

export type OrderForm = {
  delivery: DeliveryForm
  // The address came from this customer's last saved order, for checking.
  addressFromLast?: boolean
  // Prices the chat gave that differ from the shop's list, which won.
  chatPrices?: string[]
  customerName: string
  address: string
  landmark: string
  area: string
  amount: string
  items: {
    name: string
    qty: string
    price: string
    // The stock item, when matched by photo or picked by the vendor.
    productId?: string
    // Stock photos close to the customer's picture, for the vendor to pick.
    choices?: string[]
    // Where the pre-selected pick came from, when the model broke a tie.
    pickedBy?: Reading<unknown>['source']
  }[]
  // When the customer asked for a drop item: their place in line.
  claimedAt?: number
}

export type Work = {
  // The message the vendor last forwarded from this chat, and what the desk
  // did with it.
  forward?: {
    message: Forwarded
    add?: Step<{
      source: Reading<unknown>['source']
      ms: number
      added: string[]
    }>
    kept?: boolean
  }
  verify?: Step<Verified>
  capture?: Step<{
    source: Reading<unknown>['source']
    ms: number
    form: OrderForm
  }>
  draft?: Step<Reading<string>>
  // The vendor's own text, reworded in place in the message box.
  rewrite?: Step<{
    reading: Reading<string>
    label: string
    from: string
    to: string
    // Numbers in what they typed that the rewrite still lost after a retry.
    lost: string[]
    undone?: boolean
  }>
  // The customer's latest messages in plain English.
  translate?: Step<Reading<string>>
  voice?: VoiceStep
  // What each voice note said, by message id, for the reply draft.
  heard?: Record<string, VoiceNote>
  // Every receipt read in this chat, by message id, so saving an order can
  // apply them all in order: a first payment, then its balance.
  receipts?: Record<string, Receipt>
  // A change to a saved order's delivery, until it is saved.
  deliveryEdit?: DeliveryForm
  // The refund account read from the chat, for the vendor to check and save.
  refund?: Step<{
    key: string
    source: Reading<unknown>['source']
    ms: number
    form: RefundTo
  }> & { key: string }
  // Why the vendor's choice of credit was refused.
  notice?: string
}

// "Same address as last time", "same place as before", "as before".
export const SAME_AS_BEFORE =
  /\bsame\b.*\b(address|place|location|spot)\b|\bas (last time|before)\b/i
