import { nameScore } from '../verify/names'
import type { Credit, VerifyConfig } from '../verify/types'
import type { Ledger } from '../verify/match'
import type { Settlement } from './types'

// Money that arrived but pays for no order. Reversed credits are left out:
// that money has already gone back.
export function unclaimedCredits(ledger: Ledger): Credit[] {
  return ledger.credits.filter(
    (c) =>
      c.direction === 'credit' &&
      !c.reversal &&
      !ledger.reversedCredits.has(c.id) &&
      !ledger.claimedCredits.has(c.id),
  )
}

// Other unclaimed money from whoever paid this credit: a customer who sent the
// same transfer twice shows up here.
export function moreFromPayer(
  paid: Credit,
  ledger: Ledger,
  config: VerifyConfig,
): Credit[] {
  return unclaimedCredits(ledger).filter(
    (c) =>
      c.id !== paid.id &&
      nameScore(paid.sender, `${c.sender} ${c.narration}`) >=
        config.nameThreshold,
  )
}

export function settle(
  credit: Credit,
  state: Settlement['state'],
  customerId: string | null,
  now: number,
): Settlement {
  return {
    id: credit.id,
    state,
    customerId,
    refundId: null,
    decidedBy: 'vendor',
    updatedAt: now,
  }
}

// A refund owed is confirmed by an outgoing transfer of the same amount to the
// same name, after the money came in. Each debit confirms one refund only.
export function applyRefunds(
  settlements: Settlement[],
  credits: Credit[],
  config: VerifyConfig,
  now: number,
): Settlement[] {
  const used = new Set(
    settlements.flatMap((s) => (s.refundId ? [s.refundId] : [])),
  )
  const changed: Settlement[] = []
  for (const s of settlements) {
    if (s.state !== 'refund owed') continue
    const paid = credits.find((c) => c.id === s.id)
    if (!paid) continue
    const out = credits.find(
      (d) =>
        d.direction === 'debit' &&
        !d.reversal &&
        !used.has(d.id) &&
        d.amountKobo === paid.amountKobo &&
        (!d.at || !paid.at || d.at.ms >= paid.at.ms) &&
        nameScore(paid.sender, `${d.sender} ${d.narration}`) >=
          config.nameThreshold,
    )
    if (!out) continue
    used.add(out.id)
    changed.push({
      ...s,
      state: 'refunded',
      refundId: out.id,
      decidedBy: 'rules',
      updatedAt: now,
    })
  }
  return changed
}
