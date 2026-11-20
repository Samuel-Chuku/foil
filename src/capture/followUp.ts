import type { Order } from '../ledger/types'
import { decodeSessionId } from '../verify/sessionId'
import type { LagosMs, VerifyConfig } from '../verify/types'

// How long a customer has been waiting on a transfer that has not landed, in
// minutes, or null when it cannot be told or does not apply.
export function waitingMin(order: Order, now: LagosMs): number | null {
  const at = order.receipt?.at
  if (order.payment.state !== 'not yet credited' || !at) return null
  if (order.receipt?.status === 'pending') return null
  return Math.max(0, Math.floor((now - at.ms) / 60_000))
}

export function formatWait(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// What a reply should ask of a customer whose payment has not been
// confirmed. Decided by rules from the receipt and the shop's wait time; the
// customer is never accused, only asked to help trace the transfer.
export function followUpFacts(
  order: Order,
  now: LagosMs,
  waitMin: number,
  config: VerifyConfig,
  // Banks the shop receives money in. A transfer from the same bank never
  // carries a session ID, so none is asked for.
  shopBanks: string[] = [],
): string[] {
  const p = order.payment
  const receipt = order.receipt
  if (!receipt || (p.state !== 'not yet credited' && p.state !== 'check')) {
    return []
  }
  if (p.reason && /reversed/i.test(p.reason)) {
    return [
      'Their bank reversed the transfer after it arrived, so it is not paid. Ask them politely to check with their bank and send it again.',
    ]
  }
  const lines: string[] = []
  const session = decodeSessionId(receipt.reference)
  const bank = config.banks.find((b) => b.id === receipt.senderBank)
  const sameBank =
    receipt.senderBank !== null && shopBanks.includes(receipt.senderBank)
  if (
    !session.ok &&
    session.reason !== 'other-route' &&
    bank?.receiptShowsSessionId &&
    !sameBank
  ) {
    lines.push(
      "Ask them to send the session ID from the transfer's details in their bank app, so the shop can trace it.",
    )
  }
  const waited = waitingMin(order, now)
  if (waited !== null && waited > waitMin) {
    lines.push(
      // The ID itself is not given: the model slips digits when copying long
      // numbers, and the customer has it on their receipt.
      `The transfer has still not reached the shop after more than ${formatWait(waitMin)}. Ask them politely to check with their bank${session.ok ? ', using the session ID on their receipt' : ''}.`,
    )
  }
  return lines
}
