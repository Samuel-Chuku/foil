import type { DeliveryMethod } from '../capture/shopRules'
import type { DeliveryPlan } from '../ledger/types'
import { parseMoney } from '../verify/money'

export type DeliveryForm = {
  method: DeliveryMethod | ''
  area: string
  state: string
  park: string
  fee: string
  paidTo: 'shop' | 'rider' | ''
}

export function toDeliveryForm(plan: DeliveryPlan | null): DeliveryForm {
  return {
    method: plan?.method ?? '',
    area: plan?.area ?? '',
    state: plan?.state ?? '',
    park: plan?.park ?? '',
    fee: plan?.feeKobo == null ? '' : String(plan.feeKobo / 100),
    paidTo: plan?.paidTo ?? '',
  }
}

export function fromDeliveryForm(f: DeliveryForm): DeliveryPlan | null {
  if (!f.method) return null
  const collects = f.method !== 'pickup' && f.method !== 'customer-rider'
  return {
    method: f.method,
    area: f.area.trim(),
    state: f.state.trim(),
    park: f.park.trim(),
    feeKobo: collects ? parseMoney(f.fee) : null,
    paidTo: collects && f.paidTo ? f.paidTo : null,
  }
}
